// ─── Şematik Editörü ──────────────────────────────────────────────────────
// Kutu sembolleri (footprint pinlerinden otomatik), ortogonal tel çizimi,
// net etiketleme. Teller PCB net atamalarına otomatik senkronize edilir.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { Point } from '../types'
import { uid } from '../types'
import { segPointDist } from '../core/geometry'
import {
  SCH_GRID,
  danglingWireIds,
  ensureSymbols,
  junctionPoints,
  orthoCorner,
  removeOrphanWires,
  snapSch,
  symbolBBox,
  symbolLayout,
  symbolToWorld,
  syncSchematicNetsAndPcb,
  wiresInGroup
} from './model'
import { schematicGlyph, type GlyphPrim } from './symbols'
import { buildSheet } from './titleBlock'
import { usePrompt } from '../ui/prompts'
import { NetPopover, suggestNetName } from '../ui/NetPopover'
import { Icon } from '../ui/Icon'
import { useT } from '../i18n'

interface View {
  x: number
  y: number
  scale: number
}

const C = {
  bg: '#101418',
  grid: 'rgba(255,255,255,0.06)',
  symbol: '#4ea1d3',
  pin: '#89c4e8',
  pinName: '#a9b6c4',
  refDes: '#e8d44d',
  wire: '#7ee787',
  wireDangling: '#ff3860',
  netLabel: '#ffb347',
  selection: '#3fd3dc',
  junction: '#7ee787'
}

export function SchematicEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 4 })
  const tool = useStore((s) => s.schTool)
  const setTool = useStore((s) => s.setSchTool)
  const [mouseWorld, setMouseWorld] = useState<Point | null>(null)
  // Pin ucuna net atama popover'ı (net aracı)
  const [pinNetPopover, setPinNetPopover] = useState<
    { compId: string; padName: string; x: number; y: number } | null
  >(null)
  const [drawingWire, setDrawingWire] = useState<Point[] | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [selectedWireVertex, setSelectedWireVertex] = useState<{ wireId: string; index: number } | null>(null)
  const [wireMenu, setWireMenu] = useState<
    { x: number; y: number; wireId: string; index: number; isEndpoint: boolean } | null
  >(null)
  const shiftHeld = useRef(false)
  const dragRef = useRef<
    | { kind: 'none' }
    | { kind: 'pan' }
    | {
        kind: 'move'
        compId: string
        offset: Point
        origin: Point
        followWires: Map<string, { original: Point[]; indices: number[] }>
        moved: boolean
      }
    | { kind: 'vertex'; wireId: string; index: number; moved: boolean }
    | { kind: 'wireMove'; wireId: string; startWorld: Point; original: Point[]; moved: boolean }
  >({ kind: 'none' })

  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const store = useStore
  const ask = usePrompt((s) => s.ask)
  const t = useT()

  // ── Boyutlandırma ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight })
    )
    obs.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  // ── Eksik sembolleri oluştur (undo geçmişini kirletmeden) ──
  useEffect(() => {
    const s = store.getState()
    const draft = structuredClone(s.project)
    if (ensureSymbols(draft, s.getFootprint)) {
      store.setState({ project: draft })
    }
  }, [project.components.length, store])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current!.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left - view.x) / view.scale,
        y: (e.clientY - rect.top - view.y) / view.scale
      }
    },
    [view]
  )

  /** Pin ucuna yapış (yakınsa), yoksa ızgaraya. `fine` (Shift): ızgarasız serbest */
  const snapPoint = useCallback(
    (raw: Point, fine = false): Point => {
      const s = store.getState()
      const tol = 8 / view.scale
      for (const sym of s.project.schematic.symbols) {
        const comp = s.project.components.find((c) => c.id === sym.componentId)
        if (!comp) continue
        const fp = s.getFootprint(comp.footprintId)
        if (!fp) continue
        for (const pin of symbolLayout(fp).pins) {
          const wp = symbolToWorld(sym, pin.end)
          if (Math.hypot(wp.x - raw.x, wp.y - raw.y) < tol) return wp
        }
      }
      return fine ? raw : snapSch(raw)
    },
    [store, view.scale]
  )

  const hitSymbol = useCallback(
    (p: Point): string | null => {
      const s = store.getState()
      for (const sym of [...s.project.schematic.symbols].reverse()) {
        const comp = s.project.components.find((c) => c.id === sym.componentId)
        if (!comp) continue
        const fp = s.getFootprint(comp.footprintId)
        if (!fp) continue
        const bb = symbolBBox(sym, symbolLayout(fp))
        if (p.x >= bb.x && p.x <= bb.x + bb.width && p.y >= bb.y && p.y <= bb.y + bb.height) {
          return sym.componentId
        }
      }
      return null
    },
    [store]
  )

  const hitWire = useCallback(
    (p: Point): string | null => {
      const s = store.getState()
      const tol = 6 / view.scale
      for (const w of s.project.schematic.wires) {
        for (let i = 0; i < w.points.length - 1; i++) {
          if (segPointDist(w.points[i], w.points[i + 1], p) <= tol) return w.id
        }
      }
      return null
    },
    [store, view.scale]
  )

  /** Bir sembol pin ucuna yakın mı? (net atama / bilgi için) */
  const hitPin = useCallback(
    (p: Point): { compId: string; padName: string; pos: Point } | null => {
      const s = store.getState()
      const tol = 8 / view.scale
      let best: { compId: string; padName: string; pos: Point; d: number } | null = null
      for (const sym of s.project.schematic.symbols) {
        const comp = s.project.components.find((c) => c.id === sym.componentId)
        if (!comp) continue
        const fp = s.getFootprint(comp.footprintId)
        if (!fp) continue
        for (const pin of symbolLayout(fp).pins) {
          const wp = symbolToWorld(sym, pin.end)
          const d = Math.hypot(wp.x - p.x, wp.y - p.y)
          if (d < tol && (!best || d < best.d)) {
            best = { compId: comp.id, padName: pin.name, pos: wp, d }
          }
        }
      }
      return best
    },
    [store, view.scale]
  )

  /** Bir telin köşe noktalarından birine yakın mı? (dizin döner, yoksa -1) */
  const hitWireVertex = useCallback(
    (wireId: string, p: Point): number => {
      const s = store.getState()
      const wire = s.project.schematic.wires.find((w) => w.id === wireId)
      if (!wire) return -1
      const tol = 6 / view.scale
      return wire.points.findIndex((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) <= tol)
    },
    [store, view.scale]
  )

  /**
   * Komponenti şema + PCB'den siler; ona bağlı yetim telleri kaldırır ve
   * netleri yeniden senkronlar (şemada asılı tel/etiket kalmaz).
   */
  const deleteComponent = useCallback(
    (compId: string) => {
      const s = store.getState()
      const sym = s.project.schematic.symbols.find((x) => x.componentId === compId)
      const comp = s.project.components.find((c) => c.id === compId)
      const fp = comp && s.getFootprint(comp.footprintId)
      const pinPositions: Point[] =
        sym && fp ? symbolLayout(fp).pins.map((pin) => symbolToWorld(sym, pin.end)) : []
      s.commit((p) => {
        p.components = p.components.filter((c) => c.id !== compId)
        p.schematic.symbols = p.schematic.symbols.filter((x) => x.componentId !== compId)
        removeOrphanWires(p, s.getFootprint, pinPositions)
        syncSchematicNetsAndPcb(p, s.getFootprint)
      }, t('Komponent silindi (şema + PCB)'))
      setSelectedSymbol(null)
    },
    [store, t]
  )

  // ── Render ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, size.w, size.h)

    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.scale, view.scale)

    // Izgara
    const step = SCH_GRID
    if (view.scale * step >= 6) {
      const x0 = Math.floor(-view.x / view.scale / step) * step
      const y0 = Math.floor(-view.y / view.scale / step) * step
      const x1 = (size.w - view.x) / view.scale
      const y1 = (size.h - view.y) / view.scale
      ctx.fillStyle = C.grid
      for (let gx = x0; gx <= x1; gx += step) {
        for (let gy = y0; gy <= y1; gy += step) {
          ctx.fillRect(gx - 0.15, gy - 0.15, 0.3, 0.3)
        }
      }
    }

    const px = (n: number) => n / view.scale // ekran pikselini dünya birimine çevir

    // ── Sayfa çerçevesi + başlık bloğu (title block) ──
    const sheet = buildSheet(project, getFootprint)
    if (sheet) {
      const roleColor: Record<'label' | 'value' | 'title', string> = {
        label: 'rgba(160,176,190,0.75)',
        value: '#e6edf3',
        title: '#9fd8ff'
      }
      ctx.textBaseline = 'alphabetic'
      for (const pr of sheet.prims) {
        if (pr.t === 'line') {
          ctx.strokeStyle = 'rgba(255,255,255,0.32)'
          ctx.lineWidth = pr.w
          ctx.beginPath()
          ctx.moveTo(pr.x1, pr.y1)
          ctx.lineTo(pr.x2, pr.y2)
          ctx.stroke()
        } else {
          ctx.fillStyle = roleColor[pr.role]
          ctx.font = `${pr.bold ? 'bold ' : ''}${pr.size}px system-ui, sans-serif`
          ctx.textAlign = pr.align
          ctx.fillText(pr.text, pr.x, pr.y)
        }
      }
      ctx.textAlign = 'left'
    }

    // ── Çakışmasız etiket yerleştirme ──
    // Tüm metin etiketleri (tel adları, pin adları, net adları) dünya uzayında
    // dikdörtgen olarak kaydedilir; yeni etiket mevcutlara binerse yukarı/aşağı
    // kaydırılır. Kısa tellerde pin adı + net adı üst üste binmesini önler.
    const placedLabels: { x: number; y: number; w: number; h: number }[] = []
    const labelOverlaps = (r: { x: number; y: number; w: number; h: number }) =>
      placedLabels.some(
        (d) =>
          Math.abs(d.x - r.x) * 2 < d.w + r.w + px(3) &&
          Math.abs(d.y - r.y) * 2 < d.h + r.h + px(2)
      )
    /**
     * Etiketi çakışmadan çizer. mode:
     *  'nudge' (vars.) → çakışırsa dikeyde ±adımlarla boş yer arar
     *  'skip'          → çakışıyorsa hiç çizmez (pin adları yerinden oynamamalı)
     * (cx,cy) metnin merkez noktasıdır; align'a göre çizilir.
     */
    const drawLabel = (
      text: string,
      cx: number,
      cy: number,
      opts: {
        color: string
        fontPx?: number
        bold?: boolean
        align?: CanvasTextAlign
        mode?: 'nudge' | 'skip'
      }
    ) => {
      const fontPx = opts.fontPx ?? 11
      ctx.font = `${opts.bold ? 'bold ' : ''}${px(fontPx)}px system-ui, sans-serif`
      const w = ctx.measureText(text).width
      const h = px(fontPx)
      // align'a göre merkez düzelt
      const align = opts.align ?? 'center'
      const centerX = align === 'left' ? cx + w / 2 : align === 'right' ? cx - w / 2 : cx
      let rect = { x: centerX, y: cy, w, h }
      if (labelOverlaps(rect)) {
        if (opts.mode === 'skip') return null
        // yukarı, sonra aşağı doğru boş yer ara
        let found = false
        for (const dir of [-1, 1, -2, 2, -3, 3]) {
          const cand = { ...rect, y: cy + dir * h * 1.15 }
          if (!labelOverlaps(cand)) { rect = cand; found = true; break }
        }
        if (!found) return null // hiç yer yoksa üst üste yazma
      }
      ctx.fillStyle = opts.color
      ctx.textAlign = align
      ctx.textBaseline = 'middle'
      ctx.fillText(text, cx, rect.y)
      ctx.textBaseline = 'alphabetic'
      placedLabels.push(rect)
      return rect
    }
    /** Bir pinin ucuna değen tel var mı? (o telin etiketi neti zaten gösterir) */
    const wireNetAtPin = (pos: Point): string | null => {
      for (const w of project.schematic.wires) {
        const touches =
          w.points.some((q) => Math.hypot(q.x - pos.x, q.y - pos.y) <= 0.01) ||
          (() => {
            for (let i = 0; i < w.points.length - 1; i++) {
              if (segPointDist(w.points[i], w.points[i + 1], pos) <= 0.01) return true
            }
            return false
          })()
        if (touches) return w.net || '' // '' = adsız tel (etiket göstermiyor)
      }
      return null
    }

    // Teller — bağlantısız (asılı) uçlu teller uyarı rengiyle çizilir
    const dangling = danglingWireIds(project, getFootprint)
    for (const w of project.schematic.wires) {
      ctx.strokeStyle = dangling.has(w.id) ? C.wireDangling : C.wire
      ctx.lineWidth = selectedWire === w.id ? px(3.5) : px(2)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(w.points[0].x, w.points[0].y)
      for (const p of w.points.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      if (w.net) {
        // En uzun segmentin ortasına yerleştir (kısa uç parçalara sıkışmasın)
        let bi = 0
        let bl = -1
        for (let i = 0; i < w.points.length - 1; i++) {
          const l = Math.hypot(
            w.points[i + 1].x - w.points[i].x,
            w.points[i + 1].y - w.points[i].y
          )
          if (l > bl) { bl = l; bi = i }
        }
        const mid = w.points[bi]
        const mid2 = w.points[bi + 1]
        drawLabel(w.net, (mid.x + mid2.x) / 2, (mid.y + mid2.y) / 2 - px(8), {
          color: C.netLabel,
          fontPx: 12
        })
      }
    }

    // Seçili tel köşe noktası tutamaçları (sürüklenebilir; tekil seçim vurgulu)
    if (selectedWire) {
      const wire = project.schematic.wires.find((w) => w.id === selectedWire)
      if (wire) {
        wire.points.forEach((p, i) => {
          const isSel =
            !!selectedWireVertex &&
            selectedWireVertex.wireId === wire.id &&
            selectedWireVertex.index === i
          const isEnd = i === 0 || i === wire.points.length - 1
          const r = px(isSel ? 5.5 : 4)
          ctx.fillStyle = isSel ? C.selection : isEnd ? '#ffe08a' : '#ffffff'
          ctx.strokeStyle = isSel ? '#ffffff' : C.selection
          ctx.lineWidth = px(isSel ? 2 : 1.5)
          ctx.beginPath()
          ctx.rect(p.x - r, p.y - r, r * 2, r * 2)
          ctx.fill()
          ctx.stroke()
        })
      }
    }

    // Kavşak noktaları
    ctx.fillStyle = C.junction
    for (const j of junctionPoints(project.schematic.wires)) {
      ctx.beginPath()
      ctx.arc(j.x, j.y, px(3.5), 0, Math.PI * 2)
      ctx.fill()
    }

    // Standart sembol glifi çizici (yerel koordinatlar, ctx zaten çevrildi)
    const useStd = project.settings.schematicStandardSymbols ?? true
    const drawPrims = (prims: GlyphPrim[], stroke: string) => {
      for (const pr of prims) {
        ctx.strokeStyle = stroke
        ctx.fillStyle = stroke
        ctx.lineWidth = px(
          pr.k === 'plusminus' || pr.k === 'text' ? 1.6 : (pr.w ?? 1.7)
        )
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (pr.k === 'line') {
          ctx.beginPath()
          ctx.moveTo(pr.x1, pr.y1)
          ctx.lineTo(pr.x2, pr.y2)
          ctx.stroke()
        } else if (pr.k === 'poly') {
          ctx.beginPath()
          ctx.moveTo(pr.pts[0].x, pr.pts[0].y)
          for (const p of pr.pts.slice(1)) ctx.lineTo(p.x, p.y)
          if (pr.close) ctx.closePath()
          if (pr.fill) ctx.fill()
          else ctx.stroke()
        } else if (pr.k === 'circle') {
          ctx.beginPath()
          ctx.arc(pr.cx, pr.cy, pr.r, 0, Math.PI * 2)
          if (pr.fill) ctx.fill()
          else ctx.stroke()
        } else if (pr.k === 'arc') {
          ctx.beginPath()
          ctx.arc(pr.cx, pr.cy, pr.r, pr.a0, pr.a1)
          ctx.stroke()
        } else if (pr.k === 'plusminus') {
          ctx.beginPath()
          ctx.moveTo(pr.x - pr.s, pr.y)
          ctx.lineTo(pr.x + pr.s, pr.y)
          if (!pr.minus) {
            ctx.moveTo(pr.x, pr.y - pr.s)
            ctx.lineTo(pr.x, pr.y + pr.s)
          }
          ctx.stroke()
        } else if (pr.k === 'text') {
          ctx.font = `${pr.size ?? 2.2}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(pr.text, pr.x, pr.y)
          ctx.textBaseline = 'alphabetic'
        }
      }
    }

    // Semboller
    for (const sym of project.schematic.symbols) {
      const comp = project.components.find((c) => c.id === sym.componentId)
      if (!comp) continue
      const fp = getFootprint(comp.footprintId)
      if (!fp) continue
      const layout = symbolLayout(fp)
      const selected = selectedSymbol === comp.id
      const glyph = useStd ? schematicGlyph(fp, layout) : { kind: 'box' as const }
      const bodyColor = selected ? C.selection : C.symbol

      ctx.save()
      ctx.translate(sym.x, sym.y)
      ctx.rotate((sym.rotation * Math.PI) / 180)

      if (glyph.kind === 'passive' || glyph.kind === 'custom') {
        // Pin uçları (uç → iç), terminal noktası olmadan
        for (const pin of layout.pins) {
          ctx.strokeStyle = bodyColor
          ctx.lineWidth = px(1.7)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(pin.end.x, pin.end.y)
          ctx.lineTo(pin.inner.x, pin.inner.y)
          ctx.stroke()
        }
        // Gövde glifi
        drawPrims(glyph.prims, bodyColor)
      } else {
        // Kutu
        ctx.strokeStyle = bodyColor
        ctx.lineWidth = px(selected ? 2.5 : 1.5)
        ctx.strokeRect(layout.box.x, layout.box.y, layout.box.width, layout.box.height)

        // Pin bacakları + uç noktaları
        for (const pin of layout.pins) {
          ctx.strokeStyle = C.pin
          ctx.lineWidth = px(1.5)
          ctx.beginPath()
          ctx.moveTo(pin.end.x, pin.end.y)
          ctx.lineTo(pin.inner.x, pin.inner.y)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(pin.end.x, pin.end.y, px(2), 0, Math.PI * 2)
          ctx.fillStyle = C.pin
          ctx.fill()
        }
      }
      ctx.restore()

      // ── Etiketler: dünya uzayında (döndürülmüş sembolde de yatay okunur),
      // çakışmasız yerleştirme ile ──
      // Pin adları yalnız SIĞIYORSA çizilir: satır yüksekliği (pin aralığı)
      // ekranda yazı boyundan küçükse adlar üst üste bineceğinden tümü gizlenir
      // (bozuk görünüm yerine temiz sembol).
      const rowPx = view.scale * SCH_GRID
      const namesFit = rowPx >= 10.5
      const nameFontPx = Math.min(11, Math.max(7, rowPx * 0.72))
      const drawPinNames = glyph.kind !== 'passive' && namesFit
      for (const pin of layout.pins) {
        const endW = symbolToWorld(sym, pin.end)
        const innerW = symbolToWorld(sym, pin.inner)
        // içe (kutuya) doğru birim yön
        let ix = innerW.x - endW.x
        let iy = innerW.y - endW.y
        const il = Math.hypot(ix, iy) || 1
        ix /= il
        iy /= il
        if (drawPinNames) {
          const horizontal = Math.abs(ix) >= Math.abs(iy)
          drawLabel(pin.name, innerW.x + ix * px(4), innerW.y + iy * px(4) + (horizontal ? px(1) : 0), {
            color: C.pinName,
            fontPx: nameFontPx,
            align: horizontal ? (ix > 0 ? 'left' : 'right') : 'center',
            mode: 'skip' // pin adı yerinden oynatılamaz; sığmazsa çizilmez
          })
        }
        const net = comp.padNets[pin.name]
        if (net && namesFit) {
          // Pinin bağlı olduğu tel aynı adı zaten gösteriyorsa tekrar yazma
          // (kısa tellerde üst üste binmenin ana nedeni)
          const wn = wireNetAtPin(endW)
          if (wn === net) continue
          const horizontal = Math.abs(ix) >= Math.abs(iy)
          drawLabel(net, endW.x - ix * px(6), endW.y - iy * px(6) - (horizontal ? px(9) : 0), {
            color: C.netLabel,
            fontPx: nameFontPx,
            align: horizontal ? (ix > 0 ? 'right' : 'left') : 'center',
            mode: 'skip'
          })
        }
      }

      // RefDes + değer (sembol sınır kutusunun üstünde/altında, yatay)
      const bb = symbolBBox(sym, layout)
      drawLabel(comp.refDes, bb.x, bb.y - px(8), {
        color: C.refDes,
        fontPx: 13,
        bold: true,
        align: 'left'
      })
      if (comp.value) {
        drawLabel(comp.value, bb.x, bb.y + bb.height + px(10), {
          color: C.pinName,
          fontPx: 10,
          align: 'left'
        })
      }
    }

    // Çizilmekte olan tel
    if (drawingWire && drawingWire.length > 0 && mouseWorld) {
      const target = snapPoint(mouseWorld, shiftHeld.current)
      const last = drawingWire[drawingWire.length - 1]
      const corner = orthoCorner(last, target)
      ctx.strokeStyle = C.wire
      ctx.lineWidth = px(2)
      ctx.setLineDash([px(6), px(4)])
      ctx.beginPath()
      ctx.moveTo(drawingWire[0].x, drawingWire[0].y)
      for (const p of drawingWire.slice(1)) ctx.lineTo(p.x, p.y)
      if (corner) ctx.lineTo(corner.x, corner.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [project, size, view, drawingWire, mouseWorld, selectedSymbol, selectedWire, selectedWireVertex, getFootprint, snapPoint])

  // ── Fare ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = Math.exp(-e.deltaY * 0.0012)
    setView((v) => {
      const scale = Math.min(40, Math.max(1, v.scale * factor))
      const k = scale / v.scale
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
    })
  }, [])

  const onMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      const raw = toWorld(e)
      shiftHeld.current = e.shiftKey
      setWireMenu(null)

      // Sağ tık: seçili tel köşe noktası üzerindeyse bağlam menüsü (pan yerine)
      if (e.button === 2 && tool === 'select' && selectedWire) {
        const idx = hitWireVertex(selectedWire, raw)
        if (idx >= 0) {
          const wire = store.getState().project.schematic.wires.find((w) => w.id === selectedWire)
          setSelectedWireVertex({ wireId: selectedWire, index: idx })
          setWireMenu({
            x: e.clientX,
            y: e.clientY,
            wireId: selectedWire,
            index: idx,
            isEndpoint: !wire || idx === 0 || idx === wire.points.length - 1
          })
          return
        }
      }

      if (e.button === 1 || e.button === 2) {
        dragRef.current = { kind: 'pan' }
        return
      }
      if (e.button !== 0) return
      const s = store.getState()

      switch (tool) {
        case 'select': {
          // Tek tel seçiliyken köşe noktası tutamacı yakalama
          if (selectedWire) {
            const idx = hitWireVertex(selectedWire, raw)
            if (idx >= 0) {
              setSelectedWireVertex({ wireId: selectedWire, index: idx })
              s.beginTransaction()
              dragRef.current = { kind: 'vertex', wireId: selectedWire, index: idx, moved: false }
              break
            }
          }
          setSelectedWireVertex(null)
          const compId = hitSymbol(raw)
          if (compId) {
            setSelectedSymbol(compId)
            setSelectedWire(null)
            const sym = s.project.schematic.symbols.find((x) => x.componentId === compId)!
            // Bağlantı takibi — sembol pinlerine oturan tel uçları birlikte kaysın
            const followWires = new Map<string, { original: Point[]; indices: number[] }>()
            if (s.project.settings.connectionFollow?.enabled) {
              const comp = s.project.components.find((c) => c.id === compId)
              const fp = comp && s.getFootprint(comp.footprintId)
              if (fp) {
                const pinEnds = symbolLayout(fp).pins.map((pin) => symbolToWorld(sym, pin.end))
                const tol = 0.01
                for (const w of s.project.schematic.wires) {
                  const indices: number[] = []
                  w.points.forEach((pt, i) => {
                    if (pinEnds.some((pe) => Math.hypot(pe.x - pt.x, pe.y - pt.y) <= tol)) {
                      indices.push(i)
                    }
                  })
                  if (indices.length > 0) {
                    followWires.set(w.id, { original: w.points.map((p) => ({ ...p })), indices })
                  }
                }
              }
            }
            s.beginTransaction()
            dragRef.current = {
              kind: 'move',
              compId,
              offset: { x: raw.x - sym.x, y: raw.y - sym.y },
              origin: { x: sym.x, y: sym.y },
              followWires,
              moved: false
            }
          } else {
            const wireId = hitWire(raw)
            setSelectedWire(wireId)
            setSelectedWireVertex(null)
            setSelectedSymbol(null)
            if (wireId) {
              const wire = s.project.schematic.wires.find((w) => w.id === wireId)!
              s.beginTransaction()
              dragRef.current = {
                kind: 'wireMove',
                wireId,
                startWorld: raw,
                original: wire.points.map((p) => ({ ...p })),
                moved: false
              }
            }
          }
          break
        }
        case 'wire': {
          const p = snapPoint(raw, e.shiftKey)
          if (!drawingWire) {
            setDrawingWire([p])
          } else {
            const last = drawingWire[drawingWire.length - 1]
            const corner = orthoCorner(last, p)
            const pts = corner ? [...drawingWire, corner, p] : [...drawingWire, p]
            // Pin ucuna tıklandıysa teli bitir
            const endedOnPin = isPinEnd(p)
            if (endedOnPin && pts.length >= 2) {
              commitWire(pts)
              setDrawingWire(null)
            } else {
              setDrawingWire(pts)
            }
          }
          break
        }
        case 'net': {
          // Önce pin ucu: pinin noktasına tıklayarak doğrudan net atama
          const pin = hitPin(raw)
          if (pin) {
            setPinNetPopover({
              compId: pin.compId,
              padName: pin.padName,
              x: e.clientX,
              y: e.clientY
            })
            break
          }
          const wireId = hitWire(raw)
          if (wireId) {
            const wire = s.project.schematic.wires.find((w) => w.id === wireId)!
            const name = await ask(t('Net adı'), wire.net || '', 'GND, VCC, SIG1...')
            if (name !== null) {
              // Ad, birbirine değen tüm tel grubuna uygulanır — tek telin adı
              // değişip grubun geri kalanının eski adla kalması önlenir
              const groupIds = wiresInGroup(s.project, wireId)
              s.commit((p) => {
                for (const w of p.schematic.wires) {
                  if (groupIds.includes(w.id)) w.net = name.trim()
                }
                syncSchematicNetsAndPcb(p, s.getFootprint)
              }, t('Net adı atandı: {name}', { name: name.trim() || 'N$' }))
            }
          }
          break
        }
        case 'delete': {
          const wireId = hitWire(raw)
          if (wireId) {
            s.deleteSchematicWire(wireId)
            break
          }
          const compId = hitSymbol(raw)
          if (compId) deleteComponent(compId)
          break
        }
      }
    },
    [tool, toWorld, hitSymbol, hitWire, hitWireVertex, hitPin, deleteComponent, selectedWire, snapPoint, drawingWire, store, ask, t]
  )

  const isPinEnd = useCallback(
    (p: Point): boolean => {
      const s = store.getState()
      for (const sym of s.project.schematic.symbols) {
        const comp = s.project.components.find((c) => c.id === sym.componentId)
        if (!comp) continue
        const fp = s.getFootprint(comp.footprintId)
        if (!fp) continue
        for (const pin of symbolLayout(fp).pins) {
          const wp = symbolToWorld(sym, pin.end)
          if (Math.abs(wp.x - p.x) < 0.01 && Math.abs(wp.y - p.y) < 0.01) return true
        }
      }
      return false
    },
    [store]
  )

  const commitWire = useCallback(
    (pts: Point[]) => {
      const s = store.getState()
      s.commit((p) => {
        p.schematic.wires.push({ id: uid('w'), points: pts, net: '' })
        syncSchematicNetsAndPcb(p, s.getFootprint)
      }, t('Tel çizildi — netler PCB\'ye senkronlandı'))
    },
    [store, t]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const raw = toWorld(e)
      setMouseWorld(raw)
      shiftHeld.current = e.shiftKey
      const drag = dragRef.current
      if (drag.kind === 'pan') {
        setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }))
      } else if (drag.kind === 'move') {
        const target = snapSch({ x: raw.x - drag.offset.x, y: raw.y - drag.offset.y })
        const dx = target.x - drag.origin.x
        const dy = target.y - drag.origin.y
        drag.moved = true
        store.getState().mutateLive((p) => {
          const sym = p.schematic.symbols.find((x) => x.componentId === drag.compId)
          if (sym) {
            sym.x = target.x
            sym.y = target.y
          }
          // Bağlantı takibi — bağlı tel uçları sembolle birlikte kaysın
          for (const [wireId, info] of drag.followWires) {
            const w = p.schematic.wires.find((x) => x.id === wireId)
            if (!w) continue
            w.points = info.original.map((pt, i) =>
              info.indices.includes(i) ? { x: pt.x + dx, y: pt.y + dy } : { x: pt.x, y: pt.y }
            )
          }
        })
      } else if (drag.kind === 'vertex') {
        const target = snapPoint(raw, shiftHeld.current)
        drag.moved = true
        store.getState().mutateLive((p) => {
          const wire = p.schematic.wires.find((w) => w.id === drag.wireId)
          if (wire && wire.points[drag.index]) wire.points[drag.index] = target
        })
      } else if (drag.kind === 'wireMove') {
        let dx = raw.x - drag.startWorld.x
        let dy = raw.y - drag.startWorld.y
        dx = Math.round(dx / SCH_GRID) * SCH_GRID
        dy = Math.round(dy / SCH_GRID) * SCH_GRID
        if (dx !== 0 || dy !== 0) drag.moved = true
        if (!drag.moved) return
        store.getState().mutateLive((p) => {
          const wire = p.schematic.wires.find((w) => w.id === drag.wireId)
          if (wire) wire.points = drag.original.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        })
      }
    },
    [toWorld, store, snapPoint]
  )

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = { kind: 'none' }
    if (drag.kind === 'move' || drag.kind === 'vertex' || drag.kind === 'wireMove') {
      if (drag.moved) {
        // Sembol/tel taşınınca pin-tel bağlantıları değişmiş olabilir → netleri yeniden çöz
        const s = store.getState()
        s.mutateLive((p) => syncSchematicNetsAndPcb(p, s.getFootprint))
        store.getState().endTransaction()
      } else {
        store.setState({ pendingSnapshot: null })
      }
    }
  }, [store])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (drawingWire && drawingWire.length >= 2) {
        commitWire(drawingWire)
        setDrawingWire(null)
        return
      }
      // Sembole çift tık → pin editörü
      const compId = hitSymbol(toWorld(e))
      if (compId) {
        store.setState({ pinEditorComponentId: compId })
        return
      }
      // Seçim modunda: seçili tel üzerinde çift tık → köşe noktası ekle/sil
      if (tool === 'select' && selectedWire) {
        const s = store.getState()
        const raw = toWorld(e)
        const wire = s.project.schematic.wires.find((w) => w.id === selectedWire)
        if (wire) {
          const vertexIdx = hitWireVertex(selectedWire, raw)
          if (vertexIdx >= 0) {
            if (wire.points.length > 2) {
              s.commit((p) => {
                const w = p.schematic.wires.find((x) => x.id === selectedWire)
                if (w) {
                  w.points.splice(vertexIdx, 1)
                  syncSchematicNetsAndPcb(p, s.getFootprint)
                }
              }, t('Tel köşe noktası silindi'))
            }
          } else {
            const tol = 6 / view.scale
            let bestIdx = -1
            let bestDist = tol
            for (let i = 0; i < wire.points.length - 1; i++) {
              const d = segPointDist(wire.points[i], wire.points[i + 1], raw)
              if (d < bestDist) {
                bestDist = d
                bestIdx = i
              }
            }
            if (bestIdx >= 0) {
              const insertAt = bestIdx + 1
              const pt = snapPoint(raw)
              s.commit((p) => {
                const w = p.schematic.wires.find((x) => x.id === selectedWire)
                if (w) {
                  w.points.splice(insertAt, 0, pt)
                  syncSchematicNetsAndPcb(p, s.getFootprint)
                }
              }, t('Tel köşe noktası eklendi'))
            }
          }
        }
      }
    },
    [drawingWire, commitWire, hitSymbol, hitWireVertex, toWorld, store, tool, selectedWire, view.scale, snapPoint, t]
  )

  // ── Klavye ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const s = store.getState()
      // Bir diyalog açıkken editör kısayolları çalışmasın
      if (s.activeDialog) return
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault()
          if (e.shiftKey) s.redo()
          else s.undo()
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault()
          s.redo()
        }
        return
      }
      switch (e.key) {
        case 'Escape':
          setWireMenu(null)
          if (selectedWireVertex) { setSelectedWireVertex(null); break }
          if (drawingWire) setDrawingWire(null)
          else {
            setSelectedSymbol(null)
            setSelectedWire(null)
            setTool('select')
          }
          break
        case 'Enter':
          if (drawingWire && drawingWire.length >= 2) {
            commitWire(drawingWire)
            setDrawingWire(null)
          }
          break
        case 'w':
        case 'W':
          setTool('wire')
          break
        case 's':
        case 'S':
          setTool('select')
          break
        case 'n':
        case 'N':
          setTool('net')
          break
        case 'r':
        case 'R':
          if (selectedSymbol) {
            s.commit((p) => {
              const sym = p.schematic.symbols.find(
                (x) => x.componentId === selectedSymbol
              )
              if (sym) sym.rotation = ((sym.rotation + 90) % 360) as 0 | 90 | 180 | 270
            }, t('Sembol döndürüldü'))
          }
          break
        case 'Delete':
        case 'Backspace':
          if (selectedWireVertex) {
            const wire = s.project.schematic.wires.find((w) => w.id === selectedWireVertex.wireId)
            if (wire && wire.points.length > 2) {
              s.commit((p) => {
                const w = p.schematic.wires.find((x) => x.id === selectedWireVertex.wireId)
                if (w) {
                  w.points.splice(selectedWireVertex.index, 1)
                  syncSchematicNetsAndPcb(p, s.getFootprint)
                }
              }, t('Tel köşe noktası silindi'))
            } else if (wire) {
              s.deleteSchematicWire(selectedWireVertex.wireId)
              setSelectedWire(null)
            }
            setSelectedWireVertex(null)
          } else if (selectedWire) {
            s.deleteSchematicWire(selectedWire)
            setSelectedWire(null)
          } else if (selectedSymbol) {
            // Seçili sembolü Del ile sil (şema + PCB + yetim teller)
            deleteComponent(selectedSymbol)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, drawingWire, selectedSymbol, selectedWire, selectedWireVertex, commitWire, deleteComponent, setTool, t])

  const splitWireAt = useCallback(
    (wireId: string, index: number) => {
      const s = store.getState()
      const wire = s.project.schematic.wires.find((w) => w.id === wireId)
      if (!wire || index <= 0 || index >= wire.points.length - 1) {
        s.setStatus(t('Yalnızca iç köşe noktasında bölünebilir'))
        return
      }
      s.commit((p) => {
        const w = p.schematic.wires.find((x) => x.id === wireId)
        if (!w) return
        const first = w.points.slice(0, index + 1)
        const second = w.points.slice(index)
        w.points = first
        p.schematic.wires.push({ id: uid('w'), points: second.map((pt) => ({ ...pt })), net: w.net })
        syncSchematicNetsAndPcb(p, s.getFootprint)
      }, t('Tel noktadan bölündü'))
    },
    [store, t]
  )

  return (
    <div className="canvas-container schematic-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="sch-toolbar">
        <span className="sch-hint">
          {t('Çift tık: sembolde pin editörü, telde bitir · Tekil nokta: tıkla+Del veya sağ tık · Shift: hassas')}
        </span>
      </div>
      {pinNetPopover && (() => {
        const comp = project.components.find((c) => c.id === pinNetPopover.compId)
        if (!comp) return null
        return (
          <NetPopover
            x={pinNetPopover.x}
            y={pinNetPopover.y}
            refDes={comp.refDes}
            padName={pinNetPopover.padName}
            current={comp.padNets[pinNetPopover.padName] ?? ''}
            suggest={suggestNetName(pinNetPopover.padName)}
            onApply={(net) => {
              const s = store.getState()
              const nm = net.trim()
              s.commit((p) => {
                const c2 = p.components.find((c) => c.id === pinNetPopover.compId)
                if (c2) {
                  if (nm) c2.padNets[pinNetPopover.padName] = nm
                  else delete c2.padNets[pinNetPopover.padName]
                  // Elle atama — şema provenans kaydından düş
                  if (p.schematic.pinNets) {
                    delete p.schematic.pinNets[`${pinNetPopover.compId}::${pinNetPopover.padName}`]
                  }
                }
                // Pin bir tele bağlıysa grup adları hemen güncellensin
                syncSchematicNetsAndPcb(p, s.getFootprint)
              }, nm ? t('Net atandı: {net}', { net: nm }) : t('Net kaldırıldı'))
              setPinNetPopover(null)
            }}
            onClose={() => setPinNetPopover(null)}
          />
        )
      })()}
      {wireMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onMouseDown={() => setWireMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setWireMenu(null) }}
          />
          <div className="context-menu" style={{ left: wireMenu.x, top: wireMenu.y }}>
            <div className="context-menu-title">{t('Köşe noktası')} #{wireMenu.index + 1}</div>
            <button
              onClick={() => {
                const s = store.getState()
                const wire = s.project.schematic.wires.find((w) => w.id === wireMenu.wireId)
                if (wire && wire.points.length > 2) {
                  s.commit((p) => {
                    const w = p.schematic.wires.find((x) => x.id === wireMenu.wireId)
                    if (w) { w.points.splice(wireMenu.index, 1); syncSchematicNetsAndPcb(p, s.getFootprint) }
                  }, t('Tel köşe noktası silindi'))
                } else if (wire) {
                  s.deleteSchematicWire(wireMenu.wireId)
                  setSelectedWire(null)
                }
                setSelectedWireVertex(null)
                setWireMenu(null)
              }}
            >
              <Icon name="trash" size={13} /> {t('Noktayı sil')}
            </button>
            {!wireMenu.isEndpoint && (
              <button
                onClick={() => {
                  splitWireAt(wireMenu.wireId, wireMenu.index)
                  setSelectedWireVertex(null)
                  setWireMenu(null)
                }}
              >
                <Icon name="cut" size={13} /> {t('Teli buradan böl')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
