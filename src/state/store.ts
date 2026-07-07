// ─── Uygulama durumu (Zustand) ────────────────────────────────────────────
// Proje verisi, seçim, araç durumu, katman görünürlüğü, undo/redo geçmişi
// ve pano (kopyala/yapıştır) burada yönetilir.

import { create } from 'zustand'
import type {
  ComponentInstance,
  CopperLayer,
  DrcViolation,
  Footprint,
  Point,
  Project,
  Rotation,
  Selection,
  TextItem,
  ToolId,
  TraceSegment,
  Via,
  VisibleLayer
} from '../types'
import { emptySelection, newProject, uid } from '../types'
import { builtinFootprints, refDesPrefix } from '../library/footprints'
import { useUserLibrary } from './userLibrary'
import { runDrc } from '../core/drc'
import { autorouteAll, type AutorouteOptions } from '../core/autoroute'
import { ensureSymbols, pinsOnWire, schematicConnectedPins, syncSchematicNets } from '../schematic/model'
import { padWorldPos, padWorldSize, segPointDist } from '../core/geometry'
import { t } from '../i18n'

export type DialogId =
  | 'export'
  | 'calculators'
  | 'footprint-editor'
  | 'board-settings'
  | 'settings'
  | 'drc'
  | 'autoroute'
  | 'about'
  | null

export type AppMode = 'pcb' | 'schematic' | 'board' | 'view3d'

interface ClipboardData {
  components: ComponentInstance[]
  traces: TraceSegment[]
  vias: Via[]
  texts: TextItem[]
  origin: Point
}

export interface EditorState {
  project: Project
  mode: AppMode
  selection: Selection
  tool: ToolId
  activeLayer: CopperLayer
  visibleLayers: Record<VisibleLayer, boolean>
  /** Yerleştirilmekte olan footprint (kütüphaneden seçilen) */
  placingFootprintId: string | null
  /** Yerleştirilmekte olan görsel (SVG/PNG içe aktarıldıktan sonra) */
  placingImage: { src: string; format: 'png' | 'svg'; width: number; height: number } | null
  /** Çizilmekte olan iz */
  drawingTrace: { points: Point[]; layer: CopperLayer; net: string; width: number } | null
  /** Çizilmekte olan serbest kart dış hattı (poligon) */
  drawingBoardOutline: Point[] | null
  drcViolations: DrcViolation[] | null
  activeDialog: DialogId
  statusMessage: string
  /** DRC ihlaline zoom yapmak için hedef */
  zoomTarget: { x: number; y: number } | null
  clipboard: ClipboardData | null
  past: Project[]
  future: Project[]
  /** Sürükleme başlangıcında alınan anlık görüntü (tek undo adımı için) */
  pendingSnapshot: Project | null
  /** Pin/net editörü açık olan komponent */
  pinEditorComponentId: string | null
  /** Footprint editörüne yüklenecek footprint (builtin kopyalanır) */
  footprintEditorTarget: string | null
  /** Son ölçüm sonucu (seçimi vektörle taşımak için) */
  lastMeasure: { a: Point; b: Point } | null
  /** Son kaydetmeden bu yana kaydedilmemiş değişiklik var mı */
  dirty: boolean

  // ── Yardımcılar ──
  getFootprint: (id: string) => Footprint | undefined
  allFootprints: () => Footprint[]

  // ── Genel aksiyonlar ──
  commit: (fn: (draft: Project) => void, message?: string) => void
  mutateLive: (fn: (draft: Project) => void) => void
  /** Ayarları undo geçmişini kirletmeden güncelle (dirty işaretler) */
  updateSettings: (fn: (draft: Project) => void, message?: string) => void
  /** Kaydedildi olarak işaretle (kaydedilmemiş değişiklik uyarısını temizler) */
  markSaved: () => void
  beginTransaction: () => void
  endTransaction: () => void
  undo: () => void
  redo: () => void
  setMode: (m: AppMode) => void
  setTool: (tool: ToolId) => void
  setActiveLayer: (layer: CopperLayer) => void
  toggleLayer: (layer: VisibleLayer) => void
  setStatus: (msg: string) => void
  openDialog: (d: DialogId) => void
  openFootprintEditor: (targetId?: string) => void
  setZoomTarget: (t: { x: number; y: number } | null) => void

  // ── Seçim ──
  setSelection: (sel: Selection) => void
  clearSelection: () => void
  deleteSelection: () => void
  rotateSelection: () => void
  flipSelection: () => void
  copySelection: () => void
  paste: (at: Point) => void
  moveSelectionBy: (dx: number, dy: number) => void

  // ── Nesne işlemleri ──
  startPlacing: (footprintId: string | null) => void
  placeComponent: (footprintId: string, x: number, y: number) => void
  startTrace: (p: Point, net: string, width?: number) => void
  addTracePoint: (p: Point) => void
  finishTrace: () => void
  cancelTrace: () => void
  /** Tek iz köşe noktasını sil (2'den az kalırsa izi tümüyle kaldırır) */
  deleteTraceVertex: (traceId: string, index: number) => void
  /** İzi belirtilen iç köşe noktasında iki ayrı ize böl */
  splitTraceAt: (traceId: string, index: number) => void
  switchTraceLayer: (viaAt: Point) => void
  startBoardOutline: (p: Point) => void
  addBoardOutlinePoint: (p: Point) => void
  finishBoardOutline: () => void
  cancelBoardOutline: () => void
  addVia: (p: Point) => void
  addText: (p: Point, text: string) => void
  assignNet: (compId: string, padName: string, net: string) => void
  /** Şematik telini sil; ayar açıksa yalnız o telin verdiği net atamalarını da temizle */
  deleteSchematicWire: (wireId: string) => void
  /** Görsel yerleştirmeye başla (null → iptal) */
  startPlacingImage: (img: { src: string; format: 'png' | 'svg'; width: number; height: number } | null) => void
  /** Yerleştirilmekte olan görseli karta ekle */
  placeImage: (x: number, y: number) => void

  // ── Proje ──
  loadProject: (p: Project) => void
  resetProject: () => void
  runDrcNow: () => void
  autoroute: () => { routed: number; failed: string[]; log: string[] }
  addCustomFootprint: (fp: Footprint) => void
  removeCustomFootprint: (id: string) => void
}

const HISTORY_LIMIT = 100

const defaultVisible: Record<VisibleLayer, boolean> = {
  top: true,
  bottom: true,
  'top-silk': true,
  'bottom-silk': true,
  drill: true,
  outline: true,
  ratsnest: true,
  zones: true
}

export const useStore = create<EditorState>((set, get) => ({
  project: newProject(),
  mode: 'pcb',
  selection: emptySelection(),
  tool: 'select',
  activeLayer: 'top',
  visibleLayers: { ...defaultVisible },
  placingFootprintId: null,
  placingImage: null,
  drawingTrace: null,
  drawingBoardOutline: null,
  drcViolations: null,
  activeDialog: null,
  statusMessage: '',
  zoomTarget: null,
  clipboard: null,
  past: [],
  future: [],
  pendingSnapshot: null,
  pinEditorComponentId: null,
  footprintEditorTarget: null,
  lastMeasure: null,
  dirty: false,

  getFootprint: (id) => {
    // Öncelik: projeye gömülü > kullanıcı kütüphanesi > yerleşik
    const custom = get().project.customFootprints.find((f) => f.id === id)
    if (custom) return custom
    const user = useUserLibrary.getState().footprints.find((f) => f.id === id)
    if (user) return user
    return builtinFootprints.find((f) => f.id === id)
  },

  allFootprints: () => {
    // id'ye göre birleştir: proje > kullanıcı > yerleşik (proje kopyası önceliklidir)
    const map = new Map<string, Footprint>()
    for (const f of builtinFootprints) map.set(f.id, f)
    for (const f of useUserLibrary.getState().footprints) map.set(f.id, f)
    for (const f of get().project.customFootprints) map.set(f.id, f)
    return [...map.values()]
  },

  commit: (fn, message) =>
    set((state) => {
      const past = [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT)
      const project = structuredClone(state.project)
      fn(project)
      project.modifiedAt = new Date().toISOString()
      return {
        project,
        past,
        future: [],
        drcViolations: null,
        dirty: true,
        ...(message ? { statusMessage: message } : {})
      }
    }),

  mutateLive: (fn) =>
    set((state) => {
      const project = structuredClone(state.project)
      fn(project)
      return { project }
    }),

  updateSettings: (fn, message) =>
    set((state) => {
      const project = structuredClone(state.project)
      fn(project)
      project.modifiedAt = new Date().toISOString()
      return { project, dirty: true, ...(message ? { statusMessage: message } : {}) }
    }),

  markSaved: () => set({ dirty: false }),

  beginTransaction: () =>
    set((state) => ({ pendingSnapshot: structuredClone(state.project) })),

  endTransaction: () =>
    set((state) => {
      if (!state.pendingSnapshot) return {}
      const past = [...state.past, state.pendingSnapshot].slice(-HISTORY_LIMIT)
      return { past, future: [], pendingSnapshot: null, drcViolations: null, dirty: true }
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {}
      const past = [...state.past]
      const project = past.pop()!
      return {
        project,
        past,
        future: [structuredClone(state.project), ...state.future].slice(0, HISTORY_LIMIT),
        selection: emptySelection(),
        drcViolations: null,
        statusMessage: t('Geri alındı')
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {}
      const future = [...state.future]
      const project = future.shift()!
      return {
        project,
        future,
        past: [...state.past, structuredClone(state.project)].slice(-HISTORY_LIMIT),
        selection: emptySelection(),
        drcViolations: null,
        statusMessage: t('Yinelendi')
      }
    }),

  setMode: (mode) =>
    set({
      mode,
      drawingTrace: null,
      drawingBoardOutline: null,
      placingFootprintId: null,
      statusMessage:
        mode === 'schematic'
          ? t('Şema modu — W: tel çiz, teller PCB netlerine senkronlanır')
          : mode === 'board'
            ? t('Kart modu — kart dış hattını ölçülü, profesyonel biçimde düzenleyin')
            : mode === 'view3d'
              ? t('3B görünüm — sürükle: döndür, tekerlek: yakınlaştır, sağ tık: kaydır')
              : t('PCB modu')
    }),

  setTool: (tool) =>
    set({
      tool,
      drawingTrace: null,
      drawingBoardOutline: null,
      placingFootprintId: null,
      placingImage: null,
      statusMessage: toolHint(tool)
    }),

  setActiveLayer: (layer) => {
    if (layer === 'bottom' && get().project.board.layerCount === 1) {
      set({ statusMessage: t('Tek katmanlı kart — alt bakır kapalı (Kart ayarlarından değiştirin)') })
      return
    }
    set({
      activeLayer: layer,
      statusMessage: t('Aktif katman: {layer}', {
        layer: layer === 'top' ? t('Üst bakır') : t('Alt bakır')
      })
    })
  },

  toggleLayer: (layer) =>
    set((state) => ({
      visibleLayers: { ...state.visibleLayers, [layer]: !state.visibleLayers[layer] }
    })),

  setStatus: (msg) => set({ statusMessage: msg }),
  openDialog: (d) => set({ activeDialog: d }),

  openFootprintEditor: (targetId) =>
    set({ footprintEditorTarget: targetId ?? null, activeDialog: 'footprint-editor' }),

  setZoomTarget: (target) => set({ zoomTarget: target }),

  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: emptySelection() }),

  deleteSelection: () => {
    const { selection: sel, project, getFootprint } = get()
    const count =
      sel.componentIds.length + sel.traceIds.length + sel.viaIds.length +
      sel.textIds.length + sel.zoneIds.length + sel.imageIds.length
    if (count === 0) return
    // Ayar açıksa: silinen izlerin yalnız kendilerinin verdiği pad net atamalarını
    // (silme sonrası başka izle/telle desteklenmiyorsa) topla
    const clearNets =
      (project.settings.clearNetsOnPathDelete ?? true) && sel.traceIds.length > 0
    const affectedPads: { componentId: string; padName: string; net: string }[] = []
    if (clearNets) {
      const deleted = project.traces.filter((tr) => sel.traceIds.includes(tr.id))
      for (const tr of deleted) {
        if (!tr.net) continue
        for (const end of [tr.points[0], tr.points[tr.points.length - 1]]) {
          for (const pd of padsAtPoint(project, getFootprint, end, 0.2)) {
            if (pd.net === tr.net) affectedPads.push(pd)
          }
        }
      }
    }
    get().commit((p) => {
      p.components = p.components.filter((c) => !sel.componentIds.includes(c.id))
      p.traces = p.traces.filter((tr) => !sel.traceIds.includes(tr.id))
      p.vias = p.vias.filter((v) => !sel.viaIds.includes(v.id))
      p.texts = p.texts.filter((tx) => !sel.textIds.includes(tx.id))
      p.zones = p.zones.filter((z) => !sel.zoneIds.includes(z.id))
      p.images = p.images.filter((im) => !sel.imageIds.includes(im.id))
      // Şematik sembollerini de temizle
      p.schematic.symbols = p.schematic.symbols.filter(
        (s) => !sel.componentIds.includes(s.componentId)
      )
      if (clearNets && affectedPads.length > 0) {
        const schemPins = schematicConnectedPins(p, getFootprint)
        for (const pd of affectedPads) {
          const comp = p.components.find((c) => c.id === pd.componentId)
          if (!comp || comp.padNets[pd.padName] !== pd.net) continue
          // Şemada tel varsa dokunma (atama oradan gelir)
          if (schemPins.has(`${pd.componentId}::${pd.padName}`)) continue
          const fp = getFootprint(comp.footprintId)
          const pad = fp?.pads.find((x) => x.name === pd.padName)
          if (!pad) continue
          const pos = padWorldPos(comp, pad)
          // Kalan bir iz aynı netle bu pad'e değiyorsa atama korunur
          const stillRouted = p.traces.some(
            (tr) =>
              tr.net === pd.net && traceTouchesPoint(tr.points, pos, 0.2)
          )
          if (!stillRouted) delete comp.padNets[pd.padName]
        }
      }
    }, t('{n} nesne silindi', { n: count }))
    set({ selection: emptySelection() })
  },

  rotateSelection: () => {
    const sel = get().selection
    if (sel.componentIds.length === 0 && sel.textIds.length === 0) return
    get().commit((p) => {
      for (const c of p.components) {
        if (sel.componentIds.includes(c.id)) {
          c.rotation = ((c.rotation + 90) % 360) as Rotation
        }
      }
      for (const tx of p.texts) {
        if (sel.textIds.includes(tx.id)) {
          tx.rotation = ((tx.rotation + 90) % 360) as Rotation
        }
      }
    }, t('Döndürüldü (90°)'))
  },

  flipSelection: () => {
    const sel = get().selection
    if (sel.componentIds.length === 0) return
    if (get().project.board.layerCount === 1) {
      set({ statusMessage: t('Tek katmanlı kartta yüz değiştirilemez') })
      return
    }
    get().commit((p) => {
      for (const c of p.components) {
        if (sel.componentIds.includes(c.id)) {
          c.side = c.side === 'top' ? 'bottom' : 'top'
        }
      }
    }, t('Karşı yüze aktarıldı'))
  },

  copySelection: () => {
    const { selection, project } = get()
    const components = project.components.filter((c) =>
      selection.componentIds.includes(c.id)
    )
    const traces = project.traces.filter((tr) => selection.traceIds.includes(tr.id))
    const vias = project.vias.filter((v) => selection.viaIds.includes(v.id))
    const texts = project.texts.filter((tx) => selection.textIds.includes(tx.id))
    if (components.length + traces.length + vias.length + texts.length === 0) return
    const xs: number[] = [
      ...components.map((c) => c.x),
      ...traces.flatMap((tr) => tr.points.map((p) => p.x)),
      ...vias.map((v) => v.x),
      ...texts.map((tx) => tx.x)
    ]
    const ys: number[] = [
      ...components.map((c) => c.y),
      ...traces.flatMap((tr) => tr.points.map((p) => p.y)),
      ...vias.map((v) => v.y),
      ...texts.map((tx) => tx.y)
    ]
    const origin = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2
    }
    set({
      clipboard: structuredClone({ components, traces, vias, texts, origin }),
      statusMessage: t('{n} nesne kopyalandı', {
        n: components.length + traces.length + vias.length + texts.length
      })
    })
  },

  paste: (at) => {
    const clip = get().clipboard
    if (!clip) return
    const dx = at.x - clip.origin.x
    const dy = at.y - clip.origin.y
    const newSel = emptySelection()
    get().commit((p) => {
      for (const c of clip.components) {
        const copy = structuredClone(c)
        copy.id = uid('c')
        copy.x += dx
        copy.y += dy
        copy.refDes = nextRefDes(p, copy.refDes.replace(/\d+$/, ''))
        copy.padNets = {}
        p.components.push(copy)
        newSel.componentIds.push(copy.id)
      }
      for (const tr of clip.traces) {
        const copy = structuredClone(tr)
        copy.id = uid('t')
        copy.points = copy.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        copy.net = ''
        p.traces.push(copy)
        newSel.traceIds.push(copy.id)
      }
      for (const v of clip.vias) {
        const copy = structuredClone(v)
        copy.id = uid('v')
        copy.x += dx
        copy.y += dy
        copy.net = ''
        p.vias.push(copy)
        newSel.viaIds.push(copy.id)
      }
      for (const tx of clip.texts) {
        const copy = structuredClone(tx)
        copy.id = uid('x')
        copy.x += dx
        copy.y += dy
        p.texts.push(copy)
        newSel.textIds.push(copy.id)
      }
      ensureSymbols(p, get().getFootprint)
    }, t('Yapıştırıldı'))
    set({ selection: newSel })
  },

  moveSelectionBy: (dx, dy) => {
    const sel = get().selection
    const count =
      sel.componentIds.length + sel.traceIds.length + sel.viaIds.length +
      sel.textIds.length + sel.zoneIds.length + sel.imageIds.length
    if (count === 0) {
      set({ statusMessage: t('Taşınacak seçim yok') })
      return
    }
    get().commit((p) => {
      for (const c of p.components) {
        if (sel.componentIds.includes(c.id)) {
          c.x += dx
          c.y += dy
        }
      }
      for (const tr of p.traces) {
        if (sel.traceIds.includes(tr.id)) {
          tr.points = tr.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        }
      }
      for (const v of p.vias) {
        if (sel.viaIds.includes(v.id)) {
          v.x += dx
          v.y += dy
        }
      }
      for (const tx of p.texts) {
        if (sel.textIds.includes(tx.id)) {
          tx.x += dx
          tx.y += dy
        }
      }
      for (const z of p.zones) {
        if (sel.zoneIds.includes(z.id)) {
          z.x += dx
          z.y += dy
        }
      }
      for (const im of p.images) {
        if (sel.imageIds.includes(im.id)) {
          im.x += dx
          im.y += dy
        }
      }
    }, t('Seçim taşındı: Δx={dx}, Δy={dy} mm', { dx: dx.toFixed(2), dy: dy.toFixed(2) }))
  },

  startPlacing: (footprintId) =>
    set({
      placingFootprintId: footprintId,
      placingImage: null,
      tool: 'select',
      statusMessage: footprintId
        ? t('Yerleştirmek için karta tıklayın — Shift: çoklu, Esc: iptal')
        : ''
    }),

  placeComponent: (footprintId, x, y) => {
    const fp = get().getFootprint(footprintId)
    if (!fp) return
    const prefix = refDesPrefix(fp.category)
    get().commit((p) => {
      // Taşınabilirlik: kullanıcı kütüphanesindeki footprint'i projeye göm
      if (fp.custom && !p.customFootprints.some((f) => f.id === fp.id)) {
        p.customFootprints.push(structuredClone(fp))
      }
      p.components.push({
        id: uid('c'),
        footprintId,
        refDes: nextRefDes(p, prefix),
        value: fp.name,
        x,
        y,
        rotation: 0,
        side: p.board.layerCount === 1 ? 'top' : get().activeLayer,
        padNets: {}
      })
      ensureSymbols(p, get().getFootprint)
    }, t('{name} yerleştirildi', { name: fp.name }))
  },

  startTrace: (p, net, width) =>
    set((state) => ({
      drawingTrace: {
        points: [p],
        layer: state.activeLayer,
        net,
        width: width ?? state.project.settings.defaultTraceWidth
      }
    })),

  addTracePoint: (p) =>
    set((state) => {
      if (!state.drawingTrace) return {}
      return {
        drawingTrace: {
          ...state.drawingTrace,
          points: [...state.drawingTrace.points, p]
        }
      }
    }),

  finishTrace: () => {
    const dt = get().drawingTrace
    if (!dt || dt.points.length < 2) {
      set({ drawingTrace: null })
      return
    }
    get().commit((p) => {
      p.traces.push({
        id: uid('t'),
        layer: dt.layer,
        points: dt.points,
        width: dt.width,
        net: dt.net
      })
    }, t('İz çizildi'))
    set({ drawingTrace: null })
  },

  cancelTrace: () => set({ drawingTrace: null }),

  deleteTraceVertex: (traceId, index) => {
    const trace = get().project.traces.find((t) => t.id === traceId)
    if (!trace) return
    if (trace.points.length <= 2) {
      // 2 nokta kalırsa iz anlamsız — tümüyle sil
      get().commit((p) => {
        p.traces = p.traces.filter((t) => t.id !== traceId)
      }, t('İz silindi'))
      return
    }
    get().commit((p) => {
      const tr = p.traces.find((t) => t.id === traceId)
      if (tr && tr.points[index]) tr.points.splice(index, 1)
    }, t('İz köşe noktası silindi'))
  },

  splitTraceAt: (traceId, index) => {
    const trace = get().project.traces.find((t) => t.id === traceId)
    if (!trace) return
    // Yalnız iç noktalarda bölünebilir
    if (index <= 0 || index >= trace.points.length - 1) {
      set({ statusMessage: t('Yalnızca iç köşe noktasında bölünebilir') })
      return
    }
    get().commit((p) => {
      const tr = p.traces.find((t) => t.id === traceId)
      if (!tr) return
      const first = tr.points.slice(0, index + 1)
      const second = tr.points.slice(index)
      tr.points = first
      p.traces.push({
        id: uid('t'),
        layer: tr.layer,
        points: second.map((pt) => ({ ...pt })),
        width: tr.width,
        net: tr.net
      })
    }, t('İz noktadan bölündü'))
  },

  switchTraceLayer: (viaAt) => {
    const state = get()
    const dt = state.drawingTrace
    if (!dt) return
    if (state.project.board.layerCount === 1) {
      set({ statusMessage: t('Tek katmanlı kartta via ile katman değiştirilemez') })
      return
    }
    const otherLayer: CopperLayer = dt.layer === 'top' ? 'bottom' : 'top'
    get().commit((p) => {
      if (dt.points.length >= 2) {
        p.traces.push({
          id: uid('t'),
          layer: dt.layer,
          points: [...dt.points, viaAt],
          width: dt.width,
          net: dt.net
        })
      }
      p.vias.push({
        id: uid('v'),
        x: viaAt.x,
        y: viaAt.y,
        diameter: p.settings.defaultViaDiameter,
        drill: p.settings.defaultViaDrill,
        net: dt.net
      })
    }, t('Via eklendi — {layer} katmanda devam', {
      layer: otherLayer === 'top' ? t('üst') : t('alt')
    }))
    set({
      drawingTrace: { points: [viaAt], layer: otherLayer, net: dt.net, width: dt.width },
      activeLayer: otherLayer
    })
  },

  startBoardOutline: (p) => set({ drawingBoardOutline: [p] }),

  addBoardOutlinePoint: (p) =>
    set((state) => {
      if (!state.drawingBoardOutline) return {}
      return { drawingBoardOutline: [...state.drawingBoardOutline, p] }
    }),

  finishBoardOutline: () => {
    const pts = get().drawingBoardOutline
    if (!pts || pts.length < 3) {
      set({ drawingBoardOutline: null })
      return
    }
    const minX = Math.min(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y))
    const maxX = Math.max(...pts.map((p) => p.x))
    const maxY = Math.max(...pts.map((p) => p.y))
    const dx = -minX
    const dy = -minY
    get().commit((p) => {
      p.board.shape = 'polygon'
      p.board.points = pts.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
      p.board.width = Math.max(1, maxX - minX)
      p.board.height = Math.max(1, maxY - minY)
      // Kart orijini kaydığı için tüm nesneler yeni sınır kutusuna göre kaydırılır
      for (const c of p.components) { c.x += dx; c.y += dy }
      for (const tr of p.traces) tr.points = tr.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
      for (const v of p.vias) { v.x += dx; v.y += dy }
      for (const tx of p.texts) { tx.x += dx; tx.y += dy }
      for (const z of p.zones) { z.x += dx; z.y += dy }
      for (const h of p.board.mountingHoles) { h.x += dx; h.y += dy }
    }, t('Kart dış hattı serbest çizimle güncellendi'))
    set({ drawingBoardOutline: null, tool: 'select' })
  },

  cancelBoardOutline: () => set({ drawingBoardOutline: null }),

  addVia: (p) => {
    get().commit((proj) => {
      proj.vias.push({
        id: uid('v'),
        x: p.x,
        y: p.y,
        diameter: proj.settings.defaultViaDiameter,
        drill: proj.settings.defaultViaDrill,
        net: ''
      })
    }, t('Via eklendi'))
  },

  addText: (p, text) => {
    const state = get()
    const layer = state.activeLayer === 'top' ? 'top-silk' : 'bottom-silk'
    get().commit((proj) => {
      proj.texts.push({
        id: uid('x'),
        layer,
        x: p.x,
        y: p.y,
        text,
        size: proj.settings.defaultTextSize,
        rotation: 0,
        bold: false,
        font: proj.settings.defaultTextFont ?? 'standard'
      })
    }, t('Yazı eklendi'))
  },

  assignNet: (compId, padName, net) => {
    get().commit((p) => {
      const comp = p.components.find((c) => c.id === compId)
      if (comp) {
        if (net) comp.padNets[padName] = net
        else delete comp.padNets[padName]
      }
    }, net ? t('Net atandı: {net}', { net }) : t('Net kaldırıldı'))
  },

  deleteSchematicWire: (wireId) => {
    const { getFootprint, project } = get()
    const wire = project.schematic.wires.find((w) => w.id === wireId)
    if (!wire) return
    const clear = project.settings.clearNetsOnPathDelete ?? true
    // Silmeden ÖNCE bu tele değen pinleri topla (atamaları temizlemek için)
    const affected = clear ? pinsOnWire(project, getFootprint, wire.points) : []
    get().commit((p) => {
      p.schematic.wires = p.schematic.wires.filter((w) => w.id !== wireId)
      syncSchematicNets(p, getFootprint)
      if (clear && affected.length > 0) {
        // Silinen tel sonrası hâlâ bir tele bağlı olan pinlere dokunma; ötekilerin
        // (yalnız bu telle atanmış) netini kaldır
        const stillConnected = schematicConnectedPins(p, getFootprint)
        for (const pin of affected) {
          if (stillConnected.has(`${pin.componentId}::${pin.padName}`)) continue
          const comp = p.components.find((c) => c.id === pin.componentId)
          if (comp) delete comp.padNets[pin.padName]
        }
      }
    }, t('Tel silindi'))
  },

  startPlacingImage: (img) =>
    set({
      placingImage: img,
      placingFootprintId: null,
      tool: 'select',
      statusMessage: img
        ? t('Görseli yerleştirmek için karta tıklayın — Esc: iptal')
        : ''
    }),

  placeImage: (x, y) => {
    const img = get().placingImage
    if (!img) return
    const layer = get().activeLayer === 'top' ? 'top-silk' : 'bottom-silk'
    const newId = uid('img')
    get().commit((p) => {
      p.images.push({
        id: newId,
        layer,
        format: img.format,
        src: img.src,
        // Merkez tıklanan noktada olacak şekilde sol-üst köşe
        x: x - img.width / 2,
        y: y - img.height / 2,
        width: img.width,
        height: img.height,
        rotation: 0,
        opacity: 1,
        mirror: layer === 'bottom-silk'
      })
    }, t('Görsel eklendi'))
    set({ placingImage: null, selection: { ...emptySelection(), imageIds: [newId] } })
  },

  loadProject: (p) =>
    set({
      project: p,
      selection: emptySelection(),
      past: [],
      future: [],
      drawingTrace: null,
      drcViolations: null,
      activeLayer: 'top',
      dirty: false,
      statusMessage: t('"{name}" yüklendi', { name: p.name })
    }),

  resetProject: () =>
    set({
      project: newProject(),
      selection: emptySelection(),
      past: [],
      future: [],
      drawingTrace: null,
      drcViolations: null,
      activeLayer: 'top',
      dirty: false,
      statusMessage: t('Yeni proje oluşturuldu')
    }),

  runDrcNow: () => {
    const { project, getFootprint } = get()
    const violations = runDrc(project, getFootprint)
    set({
      drcViolations: violations,
      activeDialog: 'drc',
      statusMessage:
        violations.length === 0
          ? t('DRC temiz — ihlal yok ✓')
          : t('DRC: {e} hata, {w} uyarı', {
              e: violations.filter((v) => v.severity === 'error').length,
              w: violations.filter((v) => v.severity === 'warning').length
            })
    })
  },

  autoroute: () => {
    const { project, getFootprint } = get()
    const options: AutorouteOptions = {
      resolution: project.settings.autorouteResolution,
      traceWidth: project.settings.defaultTraceWidth,
      viaCost: project.settings.autorouteViaCost,
      allowVias: project.board.layerCount === 2
    }
    const result = autorouteAll(project, getFootprint, options)
    if (result.traces.length > 0 || result.vias.length > 0) {
      get().commit((p) => {
        p.traces.push(...result.traces)
        p.vias.push(...result.vias)
      }, t('Otorouter: {n} bağlantı rotalandı', { n: result.routedCount }))
    } else {
      set({ statusMessage: t('Otorouter: rotalanacak bağlantı bulunamadı') })
    }
    return {
      routed: result.routedCount,
      failed: result.failedNets,
      log: result.log
    }
  },

  addCustomFootprint: (fp) => {
    get().commit((p) => {
      const existing = p.customFootprints.findIndex((f) => f.id === fp.id)
      if (existing >= 0) p.customFootprints[existing] = fp
      else p.customFootprints.push(fp)
    }, t('Özel footprint kaydedildi: {name}', { name: fp.name }))
  },

  removeCustomFootprint: (id) => {
    get().commit((p) => {
      p.customFootprints = p.customFootprints.filter((f) => f.id !== id)
    }, t('Özel footprint silindi'))
  }
}))

/** Bir noktadaki (tol içinde) komponent pad'leri (MH hariç) */
function padsAtPoint(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  pt: Point,
  tol: number
): { componentId: string; padName: string; net: string }[] {
  const out: { componentId: string; padName: string; net: string }[] = []
  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      const pos = padWorldPos(comp, pad)
      const { width, height } = padWorldSize(comp, pad)
      const r = Math.max(width, height) / 2 + tol
      if (Math.hypot(pos.x - pt.x, pos.y - pt.y) <= r) {
        out.push({ componentId: comp.id, padName: pad.name, net: comp.padNets[pad.name] ?? '' })
      }
    }
  }
  return out
}

/** İz herhangi bir segmenti/ucuyla noktaya değiyor mu? */
function traceTouchesPoint(points: Point[], pt: Point, tol: number): boolean {
  if (points.length === 1) return Math.hypot(points[0].x - pt.x, points[0].y - pt.y) <= tol
  for (let i = 0; i < points.length - 1; i++) {
    if (segPointDist(points[i], points[i + 1], pt) <= tol) return true
  }
  return false
}

/** Bir sonraki boş referans numarası: R1, R2... */
export function nextRefDes(project: Project, prefix: string): string {
  let max = 0
  for (const c of project.components) {
    const m = c.refDes.match(new RegExp(`^${prefix}(\\d+)$`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}${max + 1}`
}

function toolHint(tool: ToolId): string {
  switch (tool) {
    case 'select':
      return t('Seçim — tıkla/sürükle, R: döndür, F: yüz değiştir, Del: sil. Tek iz seçiliyken köşe noktaları sürüklenebilir')
    case 'trace':
      return t('İz çizimi — pad\'e tıklayıp başlayın, V: via ile katman değiştir, çift tık/Enter: bitir')
    case 'via':
      return t('Via — eklemek için tıklayın')
    case 'text':
      return t('Yazı — eklemek için tıklayın')
    case 'zone':
      return t('Bakır alan — köşeden köşeye sürükleyin')
    case 'measure':
      return t('Ölçüm — sürükleyin; Shift: 45° kilidi. Ölçüm sonrası seçimi bu vektörle taşıyabilirsiniz')
    case 'net':
      return t('Net atama — pad\'e tıklayarak net adı verin')
    case 'delete':
      return t('Silme — nesnelere tıklayın')
    case 'board-shape':
      return t('Kart dış hattı çizimi — köşe eklemek için tıklayın, çift tık/Enter: bitir, Esc: iptal')
    default:
      return ''
  }
}
