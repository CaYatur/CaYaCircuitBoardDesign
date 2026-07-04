// ─── Kart Editörü (Kart modu) ─────────────────────────────────────────────
// Kart dış hattını Fusion benzeri, ölçülü ve profesyonel biçimde düzenler:
//   • Köşe noktası ekle / sil / taşı (Shift: hizalı/ortho, ızgara + hizalama kılavuzları)
//   • Köşe yuvarlatma (fillet) — noktaya yarıçap
//   • İç kesim / şekil ekleme (dikdörtgen, daire — delik/yuva/pencere)
//   • Kenar ve genel ölçüleri göster; ölçüye tıklayıp sayısal olarak değiştir
//   • PCB içeriğini (komponent/iz/pad) yarı saydam bindirme olarak görme

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { BoardCutout, Point } from '../types'
import { uid } from '../types'
import {
  worldToScreen,
  screenToWorld,
  fitBoardView,
  type View
} from '../render/renderer'
import {
  boardEditablePolygon,
  filletPolygon,
  cutoutOutlinePoints,
  edgeLength
} from '../core/boardGeometry'
import { componentBBox, padWorldPos, padWorldSize, snapPoint } from '../core/geometry'
import { usePrompt } from '../ui/prompts'
import { useT } from '../i18n'

type BoardTool = 'select' | 'add-rect' | 'add-circle'

type Drag =
  | { kind: 'none' }
  | { kind: 'pan' }
  | { kind: 'vertex'; index: number; moved: boolean }
  | { kind: 'cutout-move'; id: string; ox: number; oy: number; moved: boolean }
  | { kind: 'cutout-resize'; id: string; moved: boolean }
  | { kind: 'hole'; index: number; moved: boolean }
  | { kind: 'new-cut'; shape: 'rect' | 'circle'; start: Point; cur: Point }

interface LabelHit {
  x: number
  y: number
  w: number
  h: number
  action:
    | { kind: 'edge'; index: number; value: number }
    | { kind: 'bbox-w'; value: number }
    | { kind: 'bbox-h'; value: number }
    | { kind: 'radius'; index: number; value: number }
    | { kind: 'cutout-w'; id: string; value: number }
    | { kind: 'cutout-h'; id: string; value: number }
}

const C = {
  bg: '#12161c',
  board: '#1a2130',
  edge: '#d8c24a',
  vertex: '#ffffff',
  vertexSel: '#3fd3dc',
  guide: '#3fd3dc',
  dim: '#8fd6ff',
  dimBg: 'rgba(0,0,0,0.72)',
  cut: '#e0603a',
  pcb: 'rgba(150,170,200,0.5)',
  grid: 'rgba(255,255,255,0.06)',
  gridMajor: 'rgba(255,255,255,0.14)'
}

export function BoardEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ x: 80, y: 80, scale: 6 })
  const [mouseWorld, setMouseWorld] = useState<Point | null>(null)
  const [tool, setTool] = useState<BoardTool>('select')
  const [selVertex, setSelVertex] = useState<number | null>(null)
  const [selCutout, setSelCutout] = useState<string | null>(null)
  const [showPcb, setShowPcb] = useState(false)
  const [showDims, setShowDims] = useState(true)
  const [dimEdit, setDimEdit] = useState<
    { screenX: number; screenY: number; action: LabelHit['action'] } | null
  >(null)
  const [tick, setTick] = useState(0)
  const dragRef = useRef<Drag>({ kind: 'none' })
  const shiftHeld = useRef(false)
  const spaceHeld = useRef(false)
  const labelHits = useRef<LabelHit[]>([])
  const fitted = useRef(false)
  // Performans: sürüklemeleri kareye bir kez uygula (rAF)
  const pendingMove = useRef<{ raw: Point; shift: boolean } | null>(null)
  const rafId = useRef<number | null>(null)

  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const commit = useStore((s) => s.commit)
  const mutateLive = useStore((s) => s.mutateLive)
  const beginTransaction = useStore((s) => s.beginTransaction)
  const endTransaction = useStore((s) => s.endTransaction)
  const setStatus = useStore((s) => s.setStatus)
  const openDialog = useStore((s) => s.openDialog)
  const ask = usePrompt((s) => s.ask)
  const t = useT()

  const board = project.board
  const grid = project.settings.gridSize

  // Düzenlenebilir poligon (rect/daire otomatik köşe noktalarına çevrilir)
  const editable = useMemo(() => boardEditablePolygon(board), [board])
  const points = editable.points
  const radii = editable.radii

  // ── Boyutlandırma + ilk sığdırma ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    obs.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      setView(fitBoardView(project, size.w, size.h))
      fitted.current = true
    }
  }, [size, project])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const r = canvasRef.current!.getBoundingClientRect()
      return screenToWorld(view, { x: e.clientX - r.left, y: e.clientY - r.top })
    },
    [view]
  )

  const snap = useCallback(
    (p: Point): Point => (project.settings.snapToGrid ? snapPoint(p, grid) : p),
    [project.settings.snapToGrid, grid]
  )

  // ── Kart poligonunu değiştir (polygon şekline çevirerek commit) ──
  const writePolygon = useCallback(
    (
      newPoints: Point[],
      newRadii: number[],
      message: string,
      live = false
    ) => {
      const minX = Math.min(...newPoints.map((p) => p.x), 0)
      const minY = Math.min(...newPoints.map((p) => p.y), 0)
      const maxX = Math.max(...newPoints.map((p) => p.x))
      const maxY = Math.max(...newPoints.map((p) => p.y))
      const apply = (p: typeof project) => {
        p.board.shape = 'polygon'
        p.board.points = newPoints.map((pt) => ({ x: pt.x, y: pt.y }))
        p.board.vertexRadii = newRadii.slice()
        p.board.width = Math.max(1, maxX - Math.min(0, minX))
        p.board.height = Math.max(1, maxY - Math.min(0, minY))
      }
      if (live) mutateLive(apply)
      else commit(apply, message)
    },
    [commit, mutateLive, project]
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
    labelHits.current = []

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, size.w, size.h)

    const W = (p: Point) => worldToScreen(view, p)

    // Izgara
    drawGrid(ctx, view, size, grid)

    // Kart dolgusu (yay uygulanmış poligon)
    const filled = filletPolygon(points, radii)
    if (filled.length >= 3) {
      ctx.beginPath()
      const s0 = W(filled[0])
      ctx.moveTo(s0.x, s0.y)
      for (const p of filled.slice(1)) {
        const sp = W(p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.closePath()
      ctx.fillStyle = C.board
      ctx.fill()

      // Kesimler — zemin rengiyle boşalt
      for (const cut of board.cutouts ?? []) {
        const cp = cutoutOutlinePoints(cut)
        ctx.beginPath()
        const c0 = W(cp[0])
        ctx.moveTo(c0.x, c0.y)
        for (const p of cp.slice(1)) {
          const sp = W(p)
          ctx.lineTo(sp.x, sp.y)
        }
        ctx.closePath()
        ctx.fillStyle = C.bg
        ctx.fill()
        ctx.strokeStyle = selCutout === cut.id ? C.vertexSel : C.cut
        ctx.lineWidth = selCutout === cut.id ? 2 : 1.4
        ctx.stroke()
      }

      // Dış hat çizgisi
      ctx.beginPath()
      const e0 = W(filled[0])
      ctx.moveTo(e0.x, e0.y)
      for (const p of filled.slice(1)) {
        const sp = W(p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.closePath()
      ctx.strokeStyle = C.edge
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // PCB bindirmesi (yarı saydam)
    if (showPcb) drawPcbOverlay(ctx, view, project, getFootprint)

    // Montaj delikleri
    for (const h of board.mountingHoles) {
      const p = W(h)
      ctx.beginPath()
      ctx.arc(p.x, p.y, (h.drill / 2) * view.scale, 0, Math.PI * 2)
      ctx.fillStyle = C.bg
      ctx.fill()
      ctx.strokeStyle = C.edge
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // Kenar ölçüleri + köşe noktaları
    const n = points.length
    if (showDims && n >= 2) {
      for (let i = 0; i < n; i++) {
        const a = points[i]
        const b = points[(i + 1) % n]
        const len = edgeLength(a, b)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const sp = W(mid)
        // kenar normali yönünde biraz kaydır
        const dx = b.x - a.x
        const dy = b.y - a.y
        const nl = Math.hypot(dx, dy) || 1
        const off = 12
        const lx = sp.x + (dy / nl) * off
        const ly = sp.y - (dx / nl) * off
        drawDimLabel(ctx, lx, ly, `${len.toFixed(2)}`, C.dim, labelHits.current, {
          kind: 'edge',
          index: i,
          value: len
        })
      }
    }

    // Köşe noktaları (tutamaçlar)
    for (let i = 0; i < n; i++) {
      const sp = W(points[i])
      const sel = i === selVertex
      ctx.beginPath()
      ctx.rect(sp.x - (sel ? 6 : 4.5), sp.y - (sel ? 6 : 4.5), sel ? 12 : 9, sel ? 12 : 9)
      ctx.fillStyle = sel ? C.vertexSel : C.vertex
      ctx.strokeStyle = sel ? '#ffffff' : C.edge
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
      if (sel && (radii[i] ?? 0) > 0.001 && showDims) {
        drawDimLabel(ctx, sp.x, sp.y - 18, `R${(radii[i] ?? 0).toFixed(2)}`, '#ffd27a', labelHits.current, {
          kind: 'radius',
          index: i,
          value: radii[i] ?? 0
        })
      }
    }

    // Kesim ölçüleri + tutamaçlar
    for (const cut of board.cutouts ?? []) {
      if (cut.shape === 'rect') {
        const tl = W({ x: cut.x, y: cut.y })
        const br = W({ x: cut.x + cut.width, y: cut.y + cut.height })
        if (selCutout === cut.id) {
          ctx.fillStyle = C.vertexSel
          ctx.fillRect(br.x - 4, br.y - 4, 8, 8) // sağ-alt yeniden boyutlandırma
          ctx.strokeStyle = '#fff'
          ctx.strokeRect(br.x - 4, br.y - 4, 8, 8)
        }
        if (showDims) {
          drawDimLabel(ctx, (tl.x + br.x) / 2, tl.y - 12, `${cut.width.toFixed(2)}`, C.cut, labelHits.current, { kind: 'cutout-w', id: cut.id, value: cut.width })
          drawDimLabel(ctx, tl.x - 16, (tl.y + br.y) / 2, `${cut.height.toFixed(2)}`, C.cut, labelHits.current, { kind: 'cutout-h', id: cut.id, value: cut.height })
        }
      } else {
        const c = W({ x: cut.x, y: cut.y })
        const rpx = (cut.width / 2) * view.scale
        if (selCutout === cut.id) {
          ctx.fillStyle = C.vertexSel
          ctx.fillRect(c.x + rpx - 4, c.y - 4, 8, 8)
          ctx.strokeStyle = '#fff'
          ctx.strokeRect(c.x + rpx - 4, c.y - 4, 8, 8)
        }
        if (showDims) {
          drawDimLabel(ctx, c.x, c.y - rpx - 12, `⌀${cut.width.toFixed(2)}`, C.cut, labelHits.current, { kind: 'cutout-w', id: cut.id, value: cut.width })
        }
      }
    }

    // Genel (bbox) ölçüleri
    if (showDims) {
      const bx0 = W({ x: 0, y: 0 })
      const bx1 = W({ x: board.width, y: 0 })
      const by1 = W({ x: 0, y: board.height })
      // üstte genişlik
      ctx.strokeStyle = 'rgba(143,214,255,0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(bx0.x, bx0.y - 26)
      ctx.lineTo(bx1.x, bx1.y - 26)
      ctx.moveTo(bx0.x - 26, bx0.y)
      ctx.lineTo(by1.x - 26, by1.y)
      ctx.stroke()
      ctx.setLineDash([])
      drawDimLabel(ctx, (bx0.x + bx1.x) / 2, bx0.y - 26, `${board.width.toFixed(2)} mm`, '#9fe0ff', labelHits.current, { kind: 'bbox-w', value: board.width })
      drawDimLabel(ctx, bx0.x - 26, (bx0.y + by1.y) / 2, `${board.height.toFixed(2)} mm`, '#9fe0ff', labelHits.current, { kind: 'bbox-h', value: board.height })
    }

    // Hizalama kılavuzları (vertex sürüklerken)
    const drag = dragRef.current
    if (drag.kind === 'vertex' && mouseWorld) {
      const v = points[drag.index]
      ctx.strokeStyle = C.guide
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      for (let i = 0; i < n; i++) {
        if (i === drag.index) continue
        if (Math.abs(points[i].x - v.x) < 1e-6) {
          ctx.beginPath()
          const a = W({ x: v.x, y: 0 })
          const b = W({ x: v.x, y: board.height })
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
        if (Math.abs(points[i].y - v.y) < 1e-6) {
          ctx.beginPath()
          const a = W({ x: 0, y: v.y })
          const b = W({ x: board.width, y: v.y })
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }

    // Yeni kesim önizlemesi
    if (drag.kind === 'new-cut') {
      const a = W(drag.start)
      const b = W(drag.cur)
      ctx.strokeStyle = C.cut
      ctx.setLineDash([5, 3])
      ctx.lineWidth = 1.4
      if (drag.shape === 'rect') {
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      } else {
        const r = Math.hypot(b.x - a.x, b.y - a.y)
        ctx.beginPath()
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
  }, [project, view, size, points, radii, board, selVertex, selCutout, showPcb, showDims, mouseWorld, tick, getFootprint, grid])

  // ── Hizalama yaslaması: sürüklenen köşeyi diğer köşelerin x/y'sine yasla ──
  const alignSnap = useCallback(
    (p: Point, excludeIndex: number): Point => {
      const tol = 6 / view.scale
      let x = p.x
      let y = p.y
      for (let i = 0; i < points.length; i++) {
        if (i === excludeIndex) continue
        if (Math.abs(points[i].x - x) < tol) x = points[i].x
        if (Math.abs(points[i].y - y) < tol) y = points[i].y
      }
      return { x, y }
    },
    [points, view.scale]
  )

  // ── Fare olayları ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const factor = Math.exp(-e.deltaY * 0.0012)
    setView((v) => {
      const scale = Math.min(300, Math.max(1.5, v.scale * factor))
      const k = scale / v.scale
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
    })
  }, [])

  const hitLabel = (e: React.MouseEvent): LabelHit | null => {
    const r = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    for (const l of labelHits.current) {
      if (mx >= l.x && mx <= l.x + l.w && my >= l.y && my <= l.y + l.h) return l
    }
    return null
  }

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      shiftHeld.current = e.shiftKey
      const raw = toWorld(e)

      // Pan
      if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld.current)) {
        dragRef.current = { kind: 'pan' }
        return
      }
      if (e.button !== 0) return

      // Ölçü etiketine tıklama → sayısal düzenleme
      const label = hitLabel(e)
      if (label && tool === 'select') {
        setDimEdit({ screenX: e.clientX, screenY: e.clientY, action: label.action })
        return
      }

      // Yeni kesim çizimi
      if (tool === 'add-rect' || tool === 'add-circle') {
        dragRef.current = {
          kind: 'new-cut',
          shape: tool === 'add-rect' ? 'rect' : 'circle',
          start: snap(raw),
          cur: snap(raw)
        }
        return
      }

      const vtol = 8 / view.scale

      // Köşe noktası tutamacı
      const vi = points.findIndex((p) => Math.hypot(p.x - raw.x, p.y - raw.y) <= vtol)
      if (vi >= 0) {
        setSelVertex(vi)
        setSelCutout(null)
        beginTransaction()
        dragRef.current = { kind: 'vertex', index: vi, moved: false }
        return
      }

      // Montaj deliği
      const hi = board.mountingHoles.findIndex(
        (h) => Math.hypot(h.x - raw.x, h.y - raw.y) <= Math.max(vtol, h.drill / 2)
      )
      if (hi >= 0) {
        beginTransaction()
        dragRef.current = { kind: 'hole', index: hi, moved: false }
        return
      }

      // Kesim: yeniden boyutlandırma tutamacı mı, taşıma mı?
      for (const cut of board.cutouts ?? []) {
        if (cut.shape === 'rect') {
          const br = { x: cut.x + cut.width, y: cut.y + cut.height }
          if (Math.hypot(br.x - raw.x, br.y - raw.y) <= vtol && selCutout === cut.id) {
            beginTransaction()
            dragRef.current = { kind: 'cutout-resize', id: cut.id, moved: false }
            return
          }
          if (raw.x >= cut.x && raw.x <= cut.x + cut.width && raw.y >= cut.y && raw.y <= cut.y + cut.height) {
            setSelCutout(cut.id)
            setSelVertex(null)
            beginTransaction()
            dragRef.current = { kind: 'cutout-move', id: cut.id, ox: raw.x - cut.x, oy: raw.y - cut.y, moved: false }
            return
          }
        } else {
          const rr = cut.width / 2
          const handle = { x: cut.x + rr, y: cut.y }
          if (Math.hypot(handle.x - raw.x, handle.y - raw.y) <= vtol && selCutout === cut.id) {
            beginTransaction()
            dragRef.current = { kind: 'cutout-resize', id: cut.id, moved: false }
            return
          }
          if (Math.hypot(cut.x - raw.x, cut.y - raw.y) <= rr) {
            setSelCutout(cut.id)
            setSelVertex(null)
            beginTransaction()
            dragRef.current = { kind: 'cutout-move', id: cut.id, ox: raw.x - cut.x, oy: raw.y - cut.y, moved: false }
            return
          }
        }
      }

      // Boşluğa tıklama → seçim temizle
      setSelVertex(null)
      setSelCutout(null)
    },
    [toWorld, tool, points, view.scale, board, selCutout, snap, beginTransaction]
  )

  /** rAF ile kareye bir kez uygulanan sürükleme (performans) */
  const flushDrag = useCallback(() => {
    rafId.current = null
    const pm = pendingMove.current
    pendingMove.current = null
    if (!pm) return
    const drag = dragRef.current
    const raw = pm.raw
    const fine = pm.shift
    // Güncel poligonu store'dan oku (bayat kapanış olmaması için)
    const cur = boardEditablePolygon(useStore.getState().project.board)

    if (drag.kind === 'vertex') {
      let target = fine ? raw : snap(raw)
      target = alignSnap(target, drag.index)
      drag.moved = true
      const np = cur.points.map((p, i) => (i === drag.index ? target : p))
      writePolygon(np, cur.radii, '', true)
    } else if (drag.kind === 'hole') {
      const target = fine ? raw : snap(raw)
      drag.moved = true
      mutateLive((p) => {
        const h = p.board.mountingHoles[drag.index]
        if (h) { h.x = target.x; h.y = target.y }
      })
    } else if (drag.kind === 'cutout-move') {
      const target = fine ? raw : snap(raw)
      drag.moved = true
      mutateLive((p) => {
        const cut = p.board.cutouts?.find((c) => c.id === drag.id)
        if (cut) { cut.x = target.x - drag.ox; cut.y = target.y - drag.oy }
      })
    } else if (drag.kind === 'cutout-resize') {
      const target = fine ? raw : snap(raw)
      drag.moved = true
      mutateLive((p) => {
        const cut = p.board.cutouts?.find((c) => c.id === drag.id)
        if (!cut) return
        if (cut.shape === 'rect') {
          cut.width = Math.max(0.5, target.x - cut.x)
          cut.height = Math.max(0.5, target.y - cut.y)
        } else {
          cut.width = Math.max(0.5, 2 * Math.hypot(target.x - cut.x, target.y - cut.y))
        }
      })
    } else if (drag.kind === 'new-cut') {
      drag.cur = snap(raw)
      setTick((x) => x + 1)
    }
  }, [snap, alignSnap, writePolygon, mutateLive])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const raw = toWorld(e)
      setMouseWorld(raw)
      shiftHeld.current = e.shiftKey
      const drag = dragRef.current

      if (drag.kind === 'pan') {
        setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }))
        return
      }
      if (drag.kind === 'none') return
      // Diğer tüm sürüklemeler rAF ile kareye bir kez işlenir
      pendingMove.current = { raw, shift: e.shiftKey }
      if (rafId.current == null) rafId.current = requestAnimationFrame(flushDrag)
    },
    [toWorld, flushDrag]
  )

  const onMouseUp = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    if (pendingMove.current) flushDrag()
    const drag = dragRef.current
    dragRef.current = { kind: 'none' }
    if (drag.kind === 'vertex' || drag.kind === 'hole' || drag.kind === 'cutout-move' || drag.kind === 'cutout-resize') {
      if (drag.moved) endTransaction()
      else useStore.setState({ pendingSnapshot: null })
      return
    }
    if (drag.kind === 'new-cut') {
      const a = drag.start
      const b = drag.cur
      if (drag.shape === 'rect') {
        const w = Math.abs(b.x - a.x)
        const h = Math.abs(b.y - a.y)
        if (w >= 0.5 && h >= 0.5) {
          const cut: BoardCutout = { id: uid('cut'), shape: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: w, height: h, cornerRadius: 0 }
          commit((p) => { (p.board.cutouts ??= []).push(cut) }, t('Dikdörtgen kesim eklendi'))
          setSelCutout(cut.id)
        }
      } else {
        const r = Math.hypot(b.x - a.x, b.y - a.y)
        if (r >= 0.4) {
          const cut: BoardCutout = { id: uid('cut'), shape: 'circle', x: a.x, y: a.y, width: r * 2, height: r * 2 }
          commit((p) => { (p.board.cutouts ??= []).push(cut) }, t('Daire kesim eklendi'))
          setSelCutout(cut.id)
        }
      }
      setTool('select')
      setTick((x) => x + 1)
    }
  }, [commit, endTransaction, flushDrag, t])

  // rAF temizliği
  useEffect(() => () => { if (rafId.current != null) cancelAnimationFrame(rafId.current) }, [])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (tool !== 'select') return
      // Ölçü etiketine çift tık → sayısal düzenleme (tek tık gibi)
      const label = hitLabel(e)
      if (label) {
        setDimEdit({ screenX: e.clientX, screenY: e.clientY, action: label.action })
        return
      }
      const raw = toWorld(e)
      const vtol = 8 / view.scale
      const n = points.length
      // Köşe noktasına çift tık → sil (≥3 kalmalı)
      const vi = points.findIndex((p) => Math.hypot(p.x - raw.x, p.y - raw.y) <= vtol)
      if (vi >= 0) {
        if (n > 3) {
          const np = points.filter((_, i) => i !== vi)
          const nr = radii.filter((_, i) => i !== vi)
          writePolygon(np, nr, t('Kart köşe noktası silindi'))
          setSelVertex(null)
        }
        return
      }
      // Kenara çift tık → köşe noktası ekle
      let bestI = -1
      let bestD = vtol * 1.5
      for (let i = 0; i < n; i++) {
        const a = points[i]
        const b = points[(i + 1) % n]
        const d = segDist(a, b, raw)
        if (d < bestD) { bestD = d; bestI = i }
      }
      if (bestI >= 0) {
        const insertAt = bestI + 1
        const np = [...points]
        const nr = [...radii]
        np.splice(insertAt, 0, snap(raw))
        nr.splice(insertAt, 0, 0)
        writePolygon(np, nr, t('Kart köşe noktası eklendi'))
        setSelVertex(insertAt)
      }
    },
    [tool, toWorld, points, radii, view.scale, snap, writePolygon, t]
  )

  // ── Klavye ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tg.tagName)) return
      if (e.key === 'Shift') shiftHeld.current = true
      if (e.key === ' ') { spaceHeld.current = true; e.preventDefault(); return }
      const s = useStore.getState()
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo() }
        else if (e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo() }
        return
      }
      switch (e.key) {
        case 'Escape':
          setDimEdit(null); setSelVertex(null); setSelCutout(null); setTool('select')
          break
        case 'Delete':
        case 'Backspace':
          if (selCutout) {
            commit((p) => { p.board.cutouts = (p.board.cutouts ?? []).filter((c) => c.id !== selCutout) }, t('Kesim silindi'))
            setSelCutout(null)
          } else if (selVertex !== null && points.length > 3) {
            const np = points.filter((_, i) => i !== selVertex)
            const nr = radii.filter((_, i) => i !== selVertex)
            writePolygon(np, nr, t('Kart köşe noktası silindi'))
            setSelVertex(null)
          }
          break
        case 'Home':
          setView(fitBoardView(s.project, size.w, size.h))
          break
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = false
      if (e.key === ' ') spaceHeld.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [selCutout, selVertex, points, radii, writePolygon, commit, size, t])

  // Ölçü düzenlemeyi uygula
  const applyDim = (value: number) => {
    if (!dimEdit) return
    const a = dimEdit.action
    if (a.kind === 'edge') {
      const n = points.length
      const i = a.index
      const p0 = points[i]
      const p1 = points[(i + 1) % n]
      const dir = { x: p1.x - p0.x, y: p1.y - p0.y }
      const l = Math.hypot(dir.x, dir.y) || 1
      const np = points.map((p) => ({ ...p }))
      np[(i + 1) % n] = { x: p0.x + (dir.x / l) * value, y: p0.y + (dir.y / l) * value }
      writePolygon(np, radii, t('Kenar uzunluğu {v} mm', { v: value }))
    } else if (a.kind === 'radius') {
      const nr = radii.map((r, i) => (i === a.index ? Math.max(0, value) : r))
      writePolygon(points, nr, t('Köşe yuvarlatma {v} mm', { v: value }))
    } else if (a.kind === 'bbox-w') {
      const sx = value / Math.max(0.01, board.width)
      const np = points.map((p) => ({ x: p.x * sx, y: p.y }))
      writePolygon(np, radii, t('Kart genişliği {v} mm', { v: value }))
    } else if (a.kind === 'bbox-h') {
      const sy = value / Math.max(0.01, board.height)
      const np = points.map((p) => ({ x: p.x, y: p.y * sy }))
      writePolygon(np, radii, t('Kart yüksekliği {v} mm', { v: value }))
    } else if (a.kind === 'cutout-w') {
      commit((p) => { const c = p.board.cutouts?.find((x) => x.id === a.id); if (c) c.width = Math.max(0.5, value) }, t('Kesim ölçüsü güncellendi'))
    } else if (a.kind === 'cutout-h') {
      commit((p) => { const c = p.board.cutouts?.find((x) => x.id === a.id); if (c) c.height = Math.max(0.5, value) }, t('Kesim ölçüsü güncellendi'))
    }
    setDimEdit(null)
  }

  const selRadius = selVertex !== null ? radii[selVertex] ?? 0 : 0

  return (
    <div className="canvas-container board-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: 'block', cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onMouseLeave={() => { setMouseWorld(null); if (dragRef.current.kind === 'pan') dragRef.current = { kind: 'none' } }}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="board-toolbar">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title={t('Seç / köşe düzenle')}>
          ⬚ {t('Seç')}
        </button>
        <button className={tool === 'add-rect' ? 'active' : ''} onClick={() => setTool('add-rect')} title={t('Dikdörtgen kesim/şekil ekle')}>
          ▭ {t('Kesim (kare)')}
        </button>
        <button className={tool === 'add-circle' ? 'active' : ''} onClick={() => setTool('add-circle')} title={t('Daire kesim/delik ekle')}>
          ◯ {t('Kesim (daire)')}
        </button>
        <span className="board-sep" />
        {selVertex !== null && (
          <label className="board-radius">
            {t('Köşe R')}:
            <input
              type="number"
              step={0.25}
              min={0}
              value={Number(selRadius.toFixed(2))}
              onChange={(e) => {
                const v = Math.max(0, parseFloat(e.target.value) || 0)
                const nr = radii.map((r, i) => (i === selVertex ? v : r))
                writePolygon(points, nr, t('Köşe yuvarlatma {v} mm', { v }))
              }}
            />
            <span>mm</span>
          </label>
        )}
        <span className="board-sep" />
        <label className="board-check">
          <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
          {t('Ölçüler')}
        </label>
        <label className="board-check">
          <input type="checkbox" checked={showPcb} onChange={(e) => setShowPcb(e.target.checked)} />
          {t('PCB içeriğini göster')}
        </label>
        <button onClick={() => openDialog('board-settings')} title={t('Kart ayarları')}>⚙ {t('Ayarlar')}</button>
        <button
          onClick={async () => {
            const v = await ask(t('Montaj deliği çapı (mm)'), '3.2')
            if (v === null) return
            const d = parseFloat(v) || 3.2
            commit((p) => { p.board.mountingHoles.push({ x: board.width / 2, y: board.height / 2, drill: d }) }, t('Montaj deliği eklendi'))
          }}
          title={t('Montaj deliği ekle')}
        >
          ⊕ {t('Delik')}
        </button>
        <span className="board-hint">
          {t('Çift tık: köşe ekle/sil · Sürükle: taşı · Shift: hizalı · Ölçüye tıkla: sayısal değiştir')}
        </span>
      </div>

      {(selVertex !== null || selCutout) && (
        <div className="board-inspector">
          {selVertex !== null && points[selVertex] && (
            <>
              <div className="bi-title">▪ {t('Köşe')} #{selVertex + 1}</div>
              <NumInput label="X (mm)" value={points[selVertex].x} onCommit={(v) => {
                const np = points.map((p, i) => (i === selVertex ? { ...p, x: v } : p))
                writePolygon(np, radii, t('Köşe konumu güncellendi'))
              }} />
              <NumInput label="Y (mm)" value={points[selVertex].y} onCommit={(v) => {
                const np = points.map((p, i) => (i === selVertex ? { ...p, y: v } : p))
                writePolygon(np, radii, t('Köşe konumu güncellendi'))
              }} />
              <NumInput label={t('Yuvarlatma R (mm)')} min={0} value={radii[selVertex] ?? 0} onCommit={(v) => {
                const nr = radii.map((r, i) => (i === selVertex ? Math.max(0, v) : r))
                writePolygon(points, nr, t('Köşe yuvarlatma güncellendi'))
              }} />
              <button
                className="bi-del"
                disabled={points.length <= 3}
                onClick={() => {
                  if (points.length > 3) {
                    const np = points.filter((_, i) => i !== selVertex)
                    const nr = radii.filter((_, i) => i !== selVertex)
                    writePolygon(np, nr, t('Kart köşe noktası silindi'))
                    setSelVertex(null)
                  }
                }}
              >🗑 {t('Köşeyi sil')}</button>
            </>
          )}
          {selCutout && (() => {
            const cut = (board.cutouts ?? []).find((c) => c.id === selCutout)
            if (!cut) return null
            const setCut = (fn: (c: BoardCutout) => void, msg: string) =>
              commit((p) => { const c = p.board.cutouts?.find((x) => x.id === selCutout); if (c) fn(c) }, msg)
            return (
              <>
                <div className="bi-title">▪ {cut.shape === 'rect' ? t('Dikdörtgen kesim') : t('Daire kesim')}</div>
                <NumInput label="X (mm)" value={cut.x} onCommit={(v) => setCut((c) => { c.x = v }, t('Kesim güncellendi'))} />
                <NumInput label="Y (mm)" value={cut.y} onCommit={(v) => setCut((c) => { c.y = v }, t('Kesim güncellendi'))} />
                {cut.shape === 'rect' ? (
                  <>
                    <NumInput label={t('Genişlik (mm)')} min={0.5} value={cut.width} onCommit={(v) => setCut((c) => { c.width = Math.max(0.5, v) }, t('Kesim güncellendi'))} />
                    <NumInput label={t('Yükseklik (mm)')} min={0.5} value={cut.height} onCommit={(v) => setCut((c) => { c.height = Math.max(0.5, v) }, t('Kesim güncellendi'))} />
                    <NumInput label={t('Köşe R (mm)')} min={0} value={cut.cornerRadius ?? 0} onCommit={(v) => setCut((c) => { c.cornerRadius = Math.max(0, v) }, t('Kesim güncellendi'))} />
                  </>
                ) : (
                  <NumInput label={t('Çap (mm)')} min={0.5} value={cut.width} onCommit={(v) => setCut((c) => { c.width = Math.max(0.5, v) }, t('Kesim güncellendi'))} />
                )}
                <button
                  className="bi-del"
                  onClick={() => {
                    commit((p) => { p.board.cutouts = (p.board.cutouts ?? []).filter((c) => c.id !== selCutout) }, t('Kesim silindi'))
                    setSelCutout(null)
                  }}
                >🗑 {t('Kesimi sil')}</button>
              </>
            )
          })()}
        </div>
      )}

      {dimEdit && (
        <DimInput
          x={dimEdit.screenX}
          y={dimEdit.screenY}
          initial={dimEdit.action.value}
          onCancel={() => setDimEdit(null)}
          onApply={applyDim}
        />
      )}
    </div>
  )
}

/** Küçük numerik alan (Enter/blur ile uygular) — kart inspector için */
function NumInput({
  label,
  value,
  onCommit,
  min
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
}) {
  return (
    <label className="bi-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        step={0.5}
        min={min}
        defaultValue={Number(value.toFixed(3))}
        onBlur={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && Math.abs(v - value) > 1e-9) onCommit(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </label>
  )
}

// ─── Yardımcı çizim/bileşenler ─────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, view: View, size: { w: number; h: number }, grid: number) {
  const rawPx = grid * view.scale
  if (rawPx < 4) return
  const k = rawPx >= 6 ? 1 : Math.ceil(6 / rawPx)
  const step = grid * k * view.scale
  const major = step * 5
  const x0 = view.x % step
  const y0 = view.y % step
  ctx.strokeStyle = C.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = x0; x <= size.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, size.h) }
  for (let y = y0; y <= size.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(size.w, y) }
  ctx.stroke()
  const mx0 = view.x % major
  const my0 = view.y % major
  ctx.strokeStyle = C.gridMajor
  ctx.beginPath()
  for (let x = mx0; x <= size.w; x += major) { ctx.moveTo(x, 0); ctx.lineTo(x, size.h) }
  for (let y = my0; y <= size.h; y += major) { ctx.moveTo(0, y); ctx.lineTo(size.w, y) }
  ctx.stroke()
}

function drawDimLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  hits: LabelHit[],
  action: LabelHit['action']
) {
  ctx.font = '11px system-ui, sans-serif'
  const w = ctx.measureText(text).width + 8
  const h = 15
  const rx = x - w / 2
  const ry = y - h / 2
  ctx.fillStyle = C.dimBg
  ctx.fillRect(rx, ry, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(rx, ry, w, h)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  hits.push({ x: rx, y: ry, w, h, action })
}

function drawPcbOverlay(
  ctx: CanvasRenderingContext2D,
  view: View,
  project: ReturnType<typeof useStore.getState>['project'],
  getFootprint: ReturnType<typeof useStore.getState>['getFootprint']
) {
  const W = (p: Point) => worldToScreen(view, p)
  // İzler
  ctx.strokeStyle = 'rgba(150,170,200,0.45)'
  ctx.lineCap = 'round'
  for (const tr of project.traces) {
    ctx.lineWidth = Math.max(1, tr.width * view.scale)
    ctx.beginPath()
    const p0 = W(tr.points[0])
    ctx.moveTo(p0.x, p0.y)
    for (const p of tr.points.slice(1)) { const sp = W(p); ctx.lineTo(sp.x, sp.y) }
    ctx.stroke()
  }
  // Komponentler — gövde kutusu + pad'ler + ölçü
  ctx.font = '10px system-ui, sans-serif'
  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    const bb = componentBBox(comp, fp)
    const a = W({ x: bb.x, y: bb.y })
    ctx.strokeStyle = 'rgba(150,170,200,0.55)'
    ctx.lineWidth = 1
    ctx.strokeRect(a.x, a.y, bb.width * view.scale, bb.height * view.scale)
    ctx.fillStyle = 'rgba(200,180,90,0.8)'
    for (const pad of fp.pads) {
      const pos = W(padWorldPos(comp, pad))
      const { width, height } = padWorldSize(comp, pad)
      ctx.fillRect(pos.x - (width * view.scale) / 2, pos.y - (height * view.scale) / 2, Math.max(1, width * view.scale), Math.max(1, height * view.scale))
    }
    if (view.scale >= 6) {
      ctx.fillStyle = 'rgba(180,200,230,0.85)'
      ctx.fillText(`${comp.refDes} ${bb.width.toFixed(1)}×${bb.height.toFixed(1)}`, a.x, a.y - 3)
    }
  }
}

/** Ekranda beliren küçük sayısal ölçü giriş kutusu (Fusion benzeri) */
function DimInput({
  x,
  y,
  initial,
  onApply,
  onCancel
}: {
  x: number
  y: number
  initial: number
  onApply: (v: number) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(String(Number(initial.toFixed(3))))
  return (
    <div className="dim-input" style={{ left: x, top: y }}>
      <input
        autoFocus
        type="number"
        step={0.1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { const v = parseFloat(val); if (!isNaN(v)) onApply(v) }
          else if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        onBlur={() => { const v = parseFloat(val); if (!isNaN(v)) onApply(v); else onCancel() }}
      />
      <span>mm</span>
    </div>
  )
}

/** Nokta-doğru parçası mesafesi */
function segDist(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
