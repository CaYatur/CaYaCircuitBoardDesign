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
import {
  ensureSymbols,
  pinsOnWire,
  removeOrphanWires,
  removeStalePcbTraces,
  schematicConnectedPins,
  snapshotPadNets,
  symbolLayout,
  symbolToWorld,
  syncSchematicNets,
  syncSchematicNetsAndPcb
} from '../schematic/model'
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

/** Şema editörü araçları (sol araç şeridinden seçilir) */
export type SchTool = 'select' | 'wire' | 'net' | 'delete'
/** Kart editörü araçları */
export type BoardTool = 'select' | 'add-rect' | 'add-circle'
/** 3B görünüm seçenekleri */
export interface View3dOpts {
  showComponents: boolean
  showTraces: boolean
  showModels: boolean
  showPinLabels: boolean
}
/** 3B görünüme sol şeritten iletilen tek seferlik komutlar */
export type View3dRequest =
  | { kind: 'view'; v: 'iso' | 'top' | 'bottom' | 'front' }
  | { kind: 'export-png' }
  | { kind: 'export-obj' }
  | { kind: 'import-model' }
  | null

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
  /** Şema modu aracı (sol araç şeridi) */
  schTool: SchTool
  /** Kart editörü aracı (sol araç şeridi) */
  boardTool: BoardTool
  /** 3B görünüm seçenekleri (sol araç şeridi) */
  view3dOpts: View3dOpts
  /** 3B görünüme iletilen tek seferlik komut */
  view3dRequest: View3dRequest
  activeLayer: CopperLayer
  visibleLayers: Record<VisibleLayer, boolean>
  /** PCB editöründe kartı arkadan görüntüle (sol-sağ aynalanmış görünüm) */
  viewFlipped: boolean
  toggleViewFlipped: () => void
  /** Yerleştirilmekte olan footprint (kütüphaneden seçilen) */
  placingFootprintId: string | null
  /** Yerleştirilmekte olan görsel (SVG/PNG içe aktarıldıktan sonra) */
  placingImage: { src: string; format: 'png' | 'svg'; width: number; height: number } | null
  /** Çizilmekte olan iz */
  drawingTrace: { points: Point[]; layer: CopperLayer; net: string; width: number } | null
  /** Çizilmekte olan serbest kart dış hattı (poligon) */
  drawingBoardOutline: Point[] | null
  /** Çizilmekte olan serbest bakır alan (zone) sınırı (poligon) */
  drawingZone: Point[] | null
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
  /** Masaüstünde projenin kayıtlı olduğu dosya yolu (web'de null) */
  currentProjectPath: string | null
  /** Başlangıç ekranı (son kullanılanlar/yeni/aç) gösteriliyor mu */
  showStartScreen: boolean

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
  /** Projenin kayıtlı dosya yolunu ayarla (masaüstü) */
  setProjectPath: (path: string | null) => void
  /** Başlangıç ekranını göster/gizle */
  setShowStartScreen: (show: boolean) => void
  beginTransaction: () => void
  endTransaction: () => void
  undo: () => void
  redo: () => void
  setMode: (m: AppMode) => void
  setTool: (tool: ToolId) => void
  setSchTool: (tool: SchTool) => void
  setBoardTool: (tool: BoardTool) => void
  setView3dOpts: (patch: Partial<View3dOpts>) => void
  requestView3d: (req: View3dRequest) => void
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
  /** Çizim sırasında VAR OLAN bir via'ya bağlan: izi orada bitirir, via'nın
   *  diğer katmanında çizime otomatik devam eder (yeni via oluşturmaz) */
  continueTraceFromVia: (via: Via, at: Point) => void
  startBoardOutline: (p: Point) => void
  addBoardOutlinePoint: (p: Point) => void
  finishBoardOutline: () => void
  cancelBoardOutline: () => void
  startZoneDraw: (p: Point) => void
  addZonePoint: (p: Point) => void
  /** Poligonu kapatıp zone'u oluşturur (net adı zaten belirlenmiş olmalı) */
  finishZoneDraw: (net: string) => void
  cancelZoneDraw: () => void
  addVia: (p: Point) => void
  addText: (p: Point, text: string) => void
  assignNet: (compId: string, padName: string, net: string) => void
  /**
   * Tüm bağlantıları temizle. scope='all' → PCB izleri+viaları, tüm pad net
   * atamaları ve şema telleri; 'nets' → yalnız net atamaları; 'traces' → yalnız
   * PCB izleri/viaları; 'wires' → yalnız şema telleri.
   */
  clearAllConnections: (scope?: 'all' | 'nets' | 'traces' | 'wires') => void
  /** Şematik telini sil; ayar açıksa yalnız o telin verdiği net atamalarını da temizle */
  deleteSchematicWire: (wireId: string) => void
  /** 3B model ekle (içe aktarma) */
  addModel3D: (model: import('../types').Model3D) => void
  /** 3B model dönüşümünü güncelle (undo kirletmez) */
  updateModel3D: (id: string, patch: Partial<import('../types').Model3D>) => void
  /** 3B modeli sil */
  removeModel3D: (id: string) => void
  /** Görsel yerleştirmeye başla (null → iptal) */
  startPlacingImage: (img: { src: string; format: 'png' | 'svg'; width: number; height: number } | null) => void
  /** Yerleştirilmekte olan görseli karta ekle */
  placeImage: (x: number, y: number) => void

  // ── Proje ──
  loadProject: (p: Project, path?: string | null) => void
  resetProject: () => void
  runDrcNow: () => void
  autoroute: () => { routed: number; failed: string[]; log: string[] }
  /** Footprint'i projeye göm/güncelle. Karta gömülüyse uyumsuz komponentleri otomatik kaldırır. */
  addCustomFootprint: (fp: Footprint) => { removed: number; prunedNets: number }
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
  schTool: 'select',
  boardTool: 'select',
  view3dOpts: {
    showComponents: true,
    showTraces: true,
    showModels: true,
    showPinLabels: false
  },
  view3dRequest: null,
  activeLayer: 'top',
  visibleLayers: { ...defaultVisible },
  viewFlipped: false,
  placingFootprintId: null,
  placingImage: null,
  drawingTrace: null,
  drawingBoardOutline: null,
  drawingZone: null,
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
  currentProjectPath: null,
  showStartScreen: true,

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
  setProjectPath: (path) => set({ currentProjectPath: path }),
  setShowStartScreen: (show) => set({ showStartScreen: show }),

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
      drawingZone: null,
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
      drawingZone: null,
      placingFootprintId: null,
      placingImage: null,
      statusMessage: toolHint(tool)
    }),

  setSchTool: (tool) =>
    set({
      schTool: tool,
      statusMessage:
        tool === 'wire'
          ? t('Tel çizimi — pin ucuna tıklayıp başlayın, çift tık/Enter: bitir')
          : tool === 'net'
            ? t('Net atama — pin ucuna veya tele tıklayın')
            : tool === 'delete'
              ? t('Silme — tel veya sembole tıklayın')
              : t('Seçim — sembol/tel tıkla, sürükle, R: döndür, Del: sil')
    }),

  setBoardTool: (tool) =>
    set({
      boardTool: tool,
      statusMessage:
        tool === 'add-rect'
          ? t('Dikdörtgen kesim/şekil — kart üstüne sürükleyin')
          : tool === 'add-circle'
            ? t('Daire kesim — kart üstüne sürükleyin')
            : t('Seç / köşe düzenle — köşe ve ölçüleri sürükleyin')
    }),

  setView3dOpts: (patch) =>
    set((state) => ({ view3dOpts: { ...state.view3dOpts, ...patch } })),

  requestView3d: (req) => set({ view3dRequest: req }),

  setActiveLayer: (layer) => {
    if (layer === 'bottom' && get().project.board.layerCount === 1) {
      set({ statusMessage: t('Tek katmanlı kart — alt bakır kapalı (Kart ayarlarından değiştirin)') })
      return
    }
    const dt = get().drawingTrace
    set({
      activeLayer: layer,
      // Çizim sürerken katman tuşuna basılırsa via eklemeden mevcut izin
      // rengini/katmanını anında değiştir (iptal edip yeniden çizmeye gerek yok)
      drawingTrace: dt ? { ...dt, layer } : dt,
      statusMessage: dt
        ? t('İz katmanı değişti: {layer}', {
            layer: layer === 'top' ? t('Üst bakır') : t('Alt bakır')
          })
        : t('Aktif katman: {layer}', {
        layer: layer === 'top' ? t('Üst bakır') : t('Alt bakır')
      })
    })
  },

  toggleLayer: (layer) =>
    set((state) => ({
      visibleLayers: { ...state.visibleLayers, [layer]: !state.visibleLayers[layer] }
    })),

  toggleViewFlipped: () => set((state) => ({ viewFlipped: !state.viewFlipped })),

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
      (project.settings.clearNetsOnPathDeletePcb ?? false) && sel.traceIds.length > 0
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
    // Silinen komponentlerin şemadaki pin konumları (yetim tel temizliği için)
    const deletedPinPositions: Point[] = []
    if (sel.componentIds.length > 0) {
      for (const sym of project.schematic.symbols) {
        if (!sel.componentIds.includes(sym.componentId)) continue
        const comp = project.components.find((c) => c.id === sym.componentId)
        const fp = comp && getFootprint(comp.footprintId)
        if (!fp) continue
        for (const pin of symbolLayout(fp).pins) {
          deletedPinPositions.push(symbolToWorld(sym, pin.end))
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
      // Silinen komponentin şemada asılı kalan tellerini kaldır + netleri tazele
      if (sel.componentIds.length > 0) {
        removeOrphanWires(p, getFootprint, deletedPinPositions)
        syncSchematicNetsAndPcb(p, getFootprint)
      }
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
          z.points = z.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
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
      // dt.points her zaman en az 1 nokta içerir (startTrace ile) — viaAt
      // eklenince en az 2 noktalı geçerli bir iz oluşur; bu yüzden koşulsuz
      // eklenir (aksi halde ilk noktadan hemen sağ tık/V ile via'ya
      // geçildiğinde başlangıçtan via'ya hiç iz çizilmeden atlanıyordu)
      p.traces.push({
        id: uid('t'),
        layer: dt.layer,
        points: [...dt.points, viaAt],
        width: dt.width,
        net: dt.net
      })
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

  continueTraceFromVia: (via, at) => {
    const state = get()
    const dt = state.drawingTrace
    if (!dt) return
    if (state.project.board.layerCount === 1) {
      set({ statusMessage: t('Tek katmanlı kartta via ile katman değiştirilemez') })
      return
    }
    const otherLayer: CopperLayer = dt.layer === 'top' ? 'bottom' : 'top'
    const finalNet = dt.net || via.net
    get().commit((p) => {
      // switchTraceLayer'daki gibi koşulsuz ekle — dt.points en az 1 nokta
      // içerir, at eklenince her zaman geçerli (>=2 noktalı) bir iz oluşur
      p.traces.push({
        id: uid('t'),
        layer: dt.layer,
        points: [...dt.points, at],
        width: dt.width,
        net: finalNet
      })
      if (finalNet && !via.net) {
        const v = p.vias.find((vv) => vv.id === via.id)
        if (v) v.net = finalNet
      }
    }, t('Via\'ya bağlandı — {layer} katmanda devam', {
      layer: otherLayer === 'top' ? t('üst') : t('alt')
    }))
    set({
      drawingTrace: { points: [at], layer: otherLayer, net: finalNet, width: dt.width },
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
      for (const z of p.zones) { z.points = z.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
      for (const h of p.board.mountingHoles) { h.x += dx; h.y += dy }
    }, t('Kart dış hattı serbest çizimle güncellendi'))
    set({ drawingBoardOutline: null, tool: 'select' })
  },

  cancelBoardOutline: () => set({ drawingBoardOutline: null }),

  startZoneDraw: (p) => set({ drawingZone: [p] }),

  addZonePoint: (p) =>
    set((state) => {
      if (!state.drawingZone) return {}
      return { drawingZone: [...state.drawingZone, p] }
    }),

  finishZoneDraw: (net) => {
    const pts = get().drawingZone
    if (!pts || pts.length < 3) {
      set({ drawingZone: null })
      return
    }
    get().commit((p) => {
      p.zones.push({
        id: uid('z'),
        layer: get().activeLayer,
        points: pts,
        net: net.trim(),
        clearance: p.rules.clearance,
        thermalRelief: true
      })
    }, t('Bakır alan eklendi ({net})', { net: net.trim() || t('atanmamış') }))
    set({ drawingZone: null, tool: 'select' })
  },

  cancelZoneDraw: () => set({ drawingZone: null }),

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
    const { getFootprint } = get()
    get().commit((p) => {
      const comp = p.components.find((c) => c.id === compId)
      if (comp) {
        if (net) comp.padNets[padName] = net
        else delete comp.padNets[padName]
        // Elle atama şema provenansını geçersiz kılar (senkron üzerine yazmasın)
        if (p.schematic.pinNets) delete p.schematic.pinNets[`${compId}::${padName}`]
      }
    }, net ? t('Net atandı: {net}', { net }) : t('Net kaldırıldı'))
    // Pin şemada bir tele bağlıysa bilgilendir: senkron yeniden atayabilir
    if (!net) {
      const p = get().project
      if (schematicConnectedPins(p, getFootprint).has(`${compId}::${padName}`)) {
        set({
          statusMessage: t(
            'Not: bu pin şemada bir tele bağlı — tel durdukça senkron neti yeniden atayabilir'
          )
        })
      }
    }
  },

  clearAllConnections: (scope = 'all') => {
    const clearTraces = scope === 'all' || scope === 'traces'
    const clearNets = scope === 'all' || scope === 'nets'
    const clearWires = scope === 'all' || scope === 'wires'
    get().commit((p) => {
      if (clearTraces) {
        p.traces = []
        p.vias = []
      }
      if (clearWires) {
        p.schematic.wires = []
      }
      if (clearNets) {
        for (const c of p.components) c.padNets = {}
      }
    }, t('Bağlantılar temizlendi'))
    set({ selection: emptySelection() })
  },

  deleteSchematicWire: (wireId) => {
    const { getFootprint, project } = get()
    const wire = project.schematic.wires.find((w) => w.id === wireId)
    if (!wire) return
    const clear = project.settings.clearNetsOnPathDeleteSchematic ?? true
    const removeStale = project.settings.removePcbTracesOnSchematicChange ?? true
    // Silmeden ÖNCE bu tele değen pinleri topla (atamaları temizlemek için)
    const affected = clear ? pinsOnWire(project, getFootprint, wire.points) : []
    get().commit((p) => {
      // Değişiklik öncesi pin netleri (geçersiz kalan PCB izlerini bulmak için)
      const before = removeStale ? snapshotPadNets(p) : null
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
      // Şema değişince geçersiz kalan eski PCB izlerini kaldır (ayar)
      if (before) removeStalePcbTraces(p, getFootprint, before)
    }, t('Tel silindi'))
  },

  addModel3D: (model) => {
    get().commit((p) => {
      if (!p.models3d) p.models3d = []
      p.models3d.push(model)
    }, t('3B model içe aktarıldı: {name}', { name: model.name }))
  },

  updateModel3D: (id, patch) => {
    // Kaydırıcı ayarlamaları undo geçmişini kirletmesin (dirty işaretler)
    get().updateSettings((p) => {
      const m = p.models3d?.find((x) => x.id === id)
      if (m) Object.assign(m, patch)
    })
  },

  removeModel3D: (id) => {
    get().commit((p) => {
      if (p.models3d) p.models3d = p.models3d.filter((m) => m.id !== id)
    }, t('3B model kaldırıldı'))
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

  loadProject: (p, path = null) =>
    set({
      project: p,
      selection: emptySelection(),
      past: [],
      future: [],
      drawingTrace: null,
      drcViolations: null,
      activeLayer: 'top',
      dirty: false,
      currentProjectPath: path,
      showStartScreen: false,
      statusMessage: t('"{name}" yüklendi', { name: p.name })
    }),

  resetProject: () =>
    set({
      project: newProject(),
      currentProjectPath: null,
      showStartScreen: false,
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
    const { project, getFootprint } = get()
    const oldFp = project.customFootprints.find((f) => f.id === fp.id)
    // Footprint daha önce projeye gömülüyse (kartta kullanılıyorsa) eski/yeni pad
    // adlarını karşılaştır: hiç ortak pad kalmadıysa bu footprint'i kullanan
    // komponentler artık anlamsız (uyumsuz) sayılır ve otomatik kaldırılır.
    const oldNames = new Set((oldFp?.pads ?? []).map((p) => p.name))
    const newNames = new Set(fp.pads.map((p) => p.name))
    const hasOverlap = !oldFp || oldNames.size === 0 || [...oldNames].some((n) => newNames.has(n))
    const incompatibleIds = !hasOverlap
      ? project.components.filter((c) => c.footprintId === fp.id).map((c) => c.id)
      : []
    const deletedPinPositions: Point[] = []
    if (incompatibleIds.length > 0) {
      for (const sym of project.schematic.symbols) {
        if (!incompatibleIds.includes(sym.componentId)) continue
        const comp = project.components.find((c) => c.id === sym.componentId)
        const symFp = comp && getFootprint(comp.footprintId)
        if (!symFp) continue
        for (const pin of symbolLayout(symFp).pins) {
          deletedPinPositions.push(symbolToWorld(sym, pin.end))
        }
      }
    }
    let prunedNets = 0
    get().commit((p) => {
      const existing = p.customFootprints.findIndex((f) => f.id === fp.id)
      if (existing >= 0) p.customFootprints[existing] = fp
      else p.customFootprints.push(fp)

      if (incompatibleIds.length > 0) {
        p.components = p.components.filter((c) => !incompatibleIds.includes(c.id))
        p.schematic.symbols = p.schematic.symbols.filter(
          (s) => !incompatibleIds.includes(s.componentId)
        )
        removeOrphanWires(p, getFootprint, deletedPinPositions)
      }
      // Kalan komponentlerde artık var olmayan pad adlarına ait net atamalarını temizle
      for (const c of p.components) {
        if (c.footprintId !== fp.id) continue
        for (const key of Object.keys(c.padNets)) {
          if (!newNames.has(key)) { delete c.padNets[key]; prunedNets++ }
        }
      }
      if (incompatibleIds.length > 0 || prunedNets > 0) syncSchematicNetsAndPcb(p, getFootprint)
    }, t('Özel footprint kaydedildi: {name}', { name: fp.name }))
    return { removed: incompatibleIds.length, prunedNets }
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
      return t('Bakır alan — köşe köşe tıklayın, çift tık/Enter ile bitirin (Esc: iptal)')
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
