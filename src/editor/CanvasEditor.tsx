// ─── İnteraktif Canvas Editörü ────────────────────────────────────────────
// Pan/zoom, seçim, taşıma, iz çizimi, via, ölçüm, bakır alan, net atama ve
// tüm klavye kısayolları burada ele alınır.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { emptySelection, uid, type Point, type Selection } from '../types'
import {
  fitBoardView,
  render,
  screenToWorld,
  type View
} from '../render/renderer'
import { analyzeNets, type NetAnalysis } from '../core/netlist'
import { snap45, snapPoint, componentBBox, pointInRect, segPointDist, padWorldPos } from '../core/geometry'
import { planFollow, tidyTrace } from '../core/follow'
import { hitTest, findPadAt, findViaAt } from './hittest'
import { computeZoneFill, type ZoneFillResult } from '../core/zoneFill'
import { rawCopperItems } from '../io/exportGeometry'
import { usePrompt } from '../ui/prompts'
import { NetPopover, suggestNetName } from '../ui/NetPopover'
import { t as tr, useT } from '../i18n'

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan' }
  | {
      kind: 'move'
      startWorld: Point
      originals: Map<string, { x: number; y: number } | Point[]>
      /** Bağlantı takibi: taşınmayan ama bağlı iz köşe noktaları */
      followTraces: Map<string, { original: Point[]; indices: number[] }>
      /** Bağlantı takibi: taşınmayan ama bağlı vialar */
      followVias: Map<string, { x: number; y: number }>
      moved: boolean
    }
  | { kind: 'vertex'; traceId: string; index: number; moved: boolean }
  | { kind: 'marquee'; start: Point; current: Point }
  | { kind: 'measure'; start: Point; current: Point }

export function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 60, y: 60, scale: 8 })
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [mouseWorld, setMouseWorld] = useState<Point | null>(null)
  const dragRef = useRef<DragMode>({ kind: 'none' })
  const [dragTick, setDragTick] = useState(0) // marquee/measure yeniden çizimi için
  const [measureResult, setMeasureResult] = useState<{ a: Point; b: Point } | null>(null)
  const spaceHeld = useRef(false)
  const fittedOnce = useRef(false)
  // ── Performans: sürükleme sırasında ağır analizleri (ratsnest/kısa devre)
  // yeniden hesaplamayı erteler; hareketleri rAF ile kareye bir kez uygular ──
  const analysisRef = useRef<NetAnalysis | null>(null)
  const zoneFillsRef = useRef<Map<string, ZoneFillResult> | null>(null)
  const [analysisEpoch, setAnalysisEpoch] = useState(0)
  const pendingDrag = useRef<{ raw: Point; shift: boolean } | null>(null)
  const rafId = useRef<number | null>(null)
  // ── Tekil köşe noktası seçimi + bağlam menüsü + Shift hassas modu ──
  const [selectedVertex, setSelectedVertex] = useState<{ traceId: string; index: number } | null>(null)
  const [vertexMenu, setVertexMenu] = useState<
    { x: number; y: number; traceId: string; index: number; isEndpoint: boolean } | null
  >(null)
  const shiftHeld = useRef(false)
  const [imageEpoch, setImageEpoch] = useState(0) // görsel yüklenince yeniden çiz
  // ── Tek pin net atama popover'ı (net aracıyla pad'e tıklayınca) ──
  const [netPopover, setNetPopover] = useState<
    { compId: string; padName: string; x: number; y: number } | null
  >(null)

  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const activeLayer = useStore((s) => s.activeLayer)
  const visibleLayers = useStore((s) => s.visibleLayers)
  const viewFlipped = useStore((s) => s.viewFlipped)
  const placingFootprintId = useStore((s) => s.placingFootprintId)
  const placingImage = useStore((s) => s.placingImage)
  const drawingTrace = useStore((s) => s.drawingTrace)
  const drawingBoardOutline = useStore((s) => s.drawingBoardOutline)
  const drawingZone = useStore((s) => s.drawingZone)
  const drcViolations = useStore((s) => s.drcViolations)
  const zoomTarget = useStore((s) => s.zoomTarget)
  const getFootprint = useStore((s) => s.getFootprint)
  const store = useStore

  const ask = usePrompt((s) => s.ask)

  // Bağlantı analizi (ratsnest/kısa devre). Sürükleme sırasında son sonuç
  // yeniden kullanılır; sürükleme bitince (analysisEpoch artınca) tazelenir.
  const analysis = useMemo(() => {
    if (dragRef.current.kind !== 'none' && analysisRef.current) {
      return analysisRef.current
    }
    const a = analyzeNets(project, getFootprint)
    analysisRef.current = a
    return a
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, getFootprint, analysisEpoch])

  // Zone dolgu şekilleri (bkz. core/zoneFill.ts) — rasterizasyon gerektirdiğinden
  // sürükleme sırasında son sonuç yeniden kullanılır, analysisEpoch'la tazelenir.
  const zoneFills = useMemo(() => {
    if (dragRef.current.kind !== 'none' && zoneFillsRef.current) {
      return zoneFillsRef.current
    }
    const map = new Map<string, ZoneFillResult>()
    for (const z of project.zones) {
      map.set(z.id, computeZoneFill(z, rawCopperItems(project, getFootprint, z.layer)))
    }
    zoneFillsRef.current = map
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, getFootprint, analysisEpoch])

  // ── Boyutlandırma ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    obs.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  // İlk açılışta kartı sığdır
  useEffect(() => {
    if (!fittedOnce.current && size.w > 100) {
      setView(fitBoardView(project, size.w, size.h))
      fittedOnce.current = true
    }
  }, [size, project])

  // DRC ihlaline zoom
  useEffect(() => {
    if (zoomTarget) {
      const scale = Math.max(view.scale, 25)
      setView({
        scale,
        x: size.w / 2 - zoomTarget.x * scale,
        y: size.h / 2 - zoomTarget.y * scale
      })
      store.setState({ zoomTarget: null })
    }
  }, [zoomTarget, size, view.scale, store])

  // ── Yardımcılar ──
  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      return screenToWorld(view, {
        x: viewFlipped ? size.w - sx : sx,
        y: e.clientY - rect.top
      })
    },
    [view, viewFlipped, size.w]
  )

  const snap = useCallback(
    (p: Point): Point => {
      const s = store.getState()
      if (!s.project.settings.snapToGrid) return p
      return snapPoint(p, s.project.settings.gridSize)
    },
    [store]
  )

  const tolWorld = 6 / view.scale // 6 px isabet toleransı

  /**
   * İz çizimi için hedef nokta: pad merkezi > 45° yaslama > grid.
   * `fine` (Shift) modunda 45° kilidi ve ızgara yaslaması devre dışı — imleç
   * tam nereye gelirse oraya, hassas serbest yerleştirme.
   */
  const traceTarget = useCallback(
    (
      raw: Point,
      fine = false
    ): { point: Point; pad: ReturnType<typeof findPadAt>; via: ReturnType<typeof findViaAt> } => {
      const s = store.getState()
      const pad = findPadAt(s.project, s.getFootprint, raw, tolWorld * 1.5)
      if (pad) return { point: pad.center, pad, via: null }
      const via = findViaAt(s.project, raw, tolWorld * 1.5)
      if (via) return { point: { x: via.x, y: via.y }, pad: null, via }
      if (fine) return { point: raw, pad: null, via: null }
      const dt = s.drawingTrace
      if (dt && dt.points.length > 0) {
        const last = dt.points[dt.points.length - 1]
        return { point: snap(snap45(last, raw)), pad: null, via: null }
      }
      return { point: snap(raw), pad: null, via: null }
    },
    [store, snap, tolWorld]
  )

  const snappedCursor = useMemo(() => {
    if (!mouseWorld) return null
    if (tool === 'trace') return traceTarget(mouseWorld, shiftHeld.current).point
    if (tool === 'via' || placingFootprintId) return snap(mouseWorld)
    return null
  }, [mouseWorld, tool, placingFootprintId, traceTarget, snap])

  // ── Render ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const drag = dragRef.current
    render(ctx, {
      project,
      getFootprint,
      view,
      width: size.w,
      height: size.h,
      visibleLayers,
      activeLayer,
      viewFlipped,
      selection,
      drawingTrace,
      drawingBoardOutline,
      mouseWorld,
      snappedCursor,
      airwires: analysis.airwires,
      drcViolations,
      placingFootprintId,
      marquee:
        drag.kind === 'marquee'
          ? { x1: drag.start.x, y1: drag.start.y, x2: drag.current.x, y2: drag.current.y }
          : null,
      drawingZone,
      zoneFills,
      measure:
        drag.kind === 'measure'
          ? { a: drag.start, b: drag.current }
          : measureResult,
      selectedVertex,
      placingImage,
      onImageLoad: () => setImageEpoch((n) => n + 1)
    })
  }, [
    project, getFootprint, view, size, visibleLayers, activeLayer, viewFlipped, selection,
    drawingTrace, drawingBoardOutline, drawingZone, zoneFills, mouseWorld, snappedCursor, analysis, drcViolations,
    placingFootprintId, dragTick, measureResult, selectedVertex, placingImage, imageEpoch
  ])

  // ── Fare olayları ──
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const rawMx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Aynalanmış görünümde view.x render'dan ÖNCEki (aynalanmamış) uzayda
      // tutulur — imlecin altındaki noktayı sabit tutmak için mx da aynı
      // uzaya çevrilmeli, yoksa yakınlaştırma imlecin ayna simetriğine kayar
      const mx = viewFlipped ? size.w - rawMx : rawMx
      const factor = Math.exp(-e.deltaY * 0.0012)
      setView((v) => {
        const scale = Math.min(300, Math.max(1.5, v.scale * factor))
        const k = scale / v.scale
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
      })
    },
    [viewFlipped, size.w]
  )

  const onMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      const s = store.getState()
      const raw = toWorld(e)
      setMeasureResult(null)
      setVertexMenu(null) // aynı değere set no-op → güvenli
      shiftHeld.current = e.shiftKey

      // Sağ tık: seçili iz köşe noktası üzerindeyse bağlam menüsü (pan yerine)
      if (e.button === 2 && s.tool === 'select' && s.selection.traceIds.length === 1) {
        const trace = s.project.traces.find((t) => t.id === s.selection.traceIds[0])
        if (trace) {
          const vTol = 8 / view.scale
          const idx = trace.points.findIndex(
            (p) => Math.hypot(p.x - raw.x, p.y - raw.y) <= vTol
          )
          if (idx >= 0) {
            setSelectedVertex({ traceId: trace.id, index: idx })
            setVertexMenu({
              x: e.clientX,
              y: e.clientY,
              traceId: trace.id,
              index: idx,
              isEndpoint: idx === 0 || idx === trace.points.length - 1
            })
            return
          }
        }
      }

      // Sağ tık: iz çizerken via bırak + katman değiştir (pan yerine) — gerçek
      // EDA araçlarındaki davranış ('V' kısayoluyla aynı)
      if (e.button === 2 && s.tool === 'trace' && s.drawingTrace) {
        const target = traceTarget(raw, e.shiftKey).point
        s.switchTraceLayer(target)
        return
      }

      // Orta tuş / sağ tuş / boşluk+sol: pan
      if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld.current)) {
        dragRef.current = { kind: 'pan' }
        return
      }
      if (e.button !== 0) return

      // ── Komponent yerleştirme ──
      if (s.placingFootprintId) {
        s.placeComponent(s.placingFootprintId, snap(raw).x, snap(raw).y)
        if (!e.shiftKey) s.startPlacing(null)
        else s.setStatus(tr('Shift ile çoklu yerleştirme — Esc: bitir'))
        return
      }

      // ── Görsel yerleştirme ──
      if (s.placingImage) {
        const at = e.shiftKey ? raw : snap(raw)
        s.placeImage(at.x, at.y)
        return
      }

      switch (s.tool) {
        case 'select': {
          // Tek iz seçiliyken köşe noktası tutamacı yakalama
          if (s.selection.traceIds.length === 1) {
            const trace = s.project.traces.find(
              (tr) => tr.id === s.selection.traceIds[0]
            )
            if (trace) {
              const vertexTol = 6 / view.scale
              const idx = trace.points.findIndex(
                (p) => Math.hypot(p.x - raw.x, p.y - raw.y) <= vertexTol
              )
              if (idx >= 0) {
                setSelectedVertex({ traceId: trace.id, index: idx })
                s.beginTransaction()
                dragRef.current = {
                  kind: 'vertex',
                  traceId: trace.id,
                  index: idx,
                  moved: false
                }
                break
              }
            }
          }
          setSelectedVertex(null)
          const hit = hitTest(s.project, s.getFootprint, raw, tolWorld)
          if (hit) {
            const already = isSelected(s.selection, hit)
            let sel: Selection
            if (e.shiftKey) {
              sel = structuredClone(s.selection)
              toggleInSelection(sel, hit)
            } else if (already) {
              sel = s.selection
            } else {
              sel = emptySelection()
              toggleInSelection(sel, hit)
            }
            s.setSelection(sel)
            // Taşıma sürüklemesi başlat
            const originals = new Map<string, { x: number; y: number } | Point[]>()
            for (const c of s.project.components) {
              if (sel.componentIds.includes(c.id)) originals.set(c.id, { x: c.x, y: c.y })
            }
            for (const t of s.project.traces) {
              if (sel.traceIds.includes(t.id)) originals.set(t.id, t.points.map((p) => ({ ...p })))
            }
            for (const v of s.project.vias) {
              if (sel.viaIds.includes(v.id)) originals.set(v.id, { x: v.x, y: v.y })
            }
            for (const t of s.project.texts) {
              if (sel.textIds.includes(t.id)) originals.set(t.id, { x: t.x, y: t.y })
            }
            for (const z of s.project.zones) {
              if (sel.zoneIds.includes(z.id)) originals.set(z.id, z.points.map((p) => ({ ...p })))
            }
            for (const im of s.project.images) {
              if (sel.imageIds.includes(im.id)) originals.set(im.id, { x: im.x, y: im.y })
            }
            // ── Bağlantı takibi: taşınan pad/via/iz uçlarına bağlı iz ve
            // vialar aynı vektörle kaymalı (bağlantı kopmasın) ──
            const followTraces = new Map<string, { original: Point[]; indices: number[] }>()
            const followVias = new Map<string, { x: number; y: number }>()
            const cf = s.project.settings.connectionFollow
            if (cf?.enabled) {
              const plan = planFollow(
                s.project,
                s.getFootprint,
                new Set(sel.componentIds),
                new Set(sel.viaIds),
                new Set(sel.traceIds),
                cf
              )
              for (const [traceId, indices] of plan.traceEdits) {
                const tr = s.project.traces.find((t) => t.id === traceId)
                if (tr) followTraces.set(traceId, { original: tr.points.map((p) => ({ ...p })), indices })
              }
              for (const viaId of plan.viaIds) {
                const v = s.project.vias.find((vi) => vi.id === viaId)
                if (v) followVias.set(viaId, { x: v.x, y: v.y })
              }
            }
            s.beginTransaction()
            dragRef.current = { kind: 'move', startWorld: raw, originals, followTraces, followVias, moved: false }
          } else {
            s.clearSelection()
            dragRef.current = { kind: 'marquee', start: raw, current: raw }
          }
          break
        }

        case 'trace': {
          const { point, pad, via } = traceTarget(raw, e.shiftKey)
          if (!s.drawingTrace) {
            s.startTrace(point, pad?.net ?? via?.net ?? '')
            if (pad && !pad.net) {
              s.setStatus(tr('İz başladı — bu pad\'e net atanmamış (Net aracıyla atayabilirsiniz)'))
            }
          } else {
            if (pad) {
              // Pad üzerinde bitir: izi kaydet + net eşitle
              const dt = s.drawingTrace
              const finalNet = dt.net || pad.net
              s.commit((p) => {
                p.traces.push({
                  id: uid('t'),
                  layer: dt.layer,
                  points: [...dt.points, point],
                  width: dt.width,
                  net: finalNet
                })
                if (finalNet) {
                  const comp = p.components.find((c) => c.id === pad.componentId)
                  if (comp && !comp.padNets[pad.padName]) {
                    comp.padNets[pad.padName] = finalNet
                  }
                }
              }, tr('İz tamamlandı'))
              store.setState({ drawingTrace: null })
            } else if (via) {
              // Var olan via üzerinde: izi ona bağla, via zaten iki katmanı da
              // bağladığı için otomatik olarak diğer katmanda çizime devam et
              s.continueTraceFromVia(via, point)
            } else {
              s.addTracePoint(point)
            }
          }
          break
        }

        case 'via':
          s.addVia(snap(raw))
          break

        case 'text': {
          const text = await ask(tr('Silkscreen yazısı'), '', tr('Örn: CaYa v1.0'))
          if (text) s.addText(snap(raw), text)
          break
        }

        case 'zone': {
          // Serbest çokgen sınır: tıkla tıkla köşe ekle, çift tık ile bitir
          // (kart dış hattı çiziminin aynısı — bkz. onDoubleClick)
          const sp = snap(raw)
          if (!s.drawingZone) s.startZoneDraw(sp)
          else s.addZonePoint(sp)
          break
        }

        case 'measure': {
          // Ölçüm başlangıcı ızgaraya yaslanır (hassas hizalama)
          const start = s.project.settings.snapToGrid ? snap(raw) : raw
          dragRef.current = { kind: 'measure', start, current: start }
          break
        }

        case 'net': {
          const pad = findPadAt(s.project, s.getFootprint, raw, tolWorld * 1.5)
          if (pad) {
            // Yalnız tıklanan pini kolayca değiştirmek için küçük popover aç
            setNetPopover({
              compId: pad.componentId,
              padName: pad.padName,
              x: e.clientX,
              y: e.clientY
            })
          } else {
            setNetPopover(null)
            s.setStatus(tr('Net atamak için bir pad\'e tıklayın'))
          }
          break
        }

        case 'delete': {
          const hit = hitTest(s.project, s.getFootprint, raw, tolWorld)
          if (hit) {
            const sel = emptySelection()
            toggleInSelection(sel, hit)
            s.setSelection(sel)
            s.deleteSelection()
          }
          break
        }

        case 'board-shape': {
          const point = snap(raw)
          if (!s.drawingBoardOutline) {
            s.startBoardOutline(point)
            s.setStatus(tr('Kart dış hattı çiziliyor — köşe eklemek için tıklayın, bitirmek için çift tık/Enter'))
          } else {
            s.addBoardOutlinePoint(point)
          }
          break
        }
      }
    },
    [store, toWorld, snap, tolWorld, traceTarget, ask]
  )

  /** Izgaraya yasla — `fine` (Shift) modunda serbest bırakır (hassas ayar) */
  const snapMaybe = useCallback(
    (p: Point, fine: boolean): Point => {
      const s = store.getState()
      if (fine || !s.project.settings.snapToGrid) return p
      return snapPoint(p, s.project.settings.gridSize)
    },
    [store]
  )

  /** rAF ile kareye bir kez uygulanan taşıma/vertex sürüklemesi (performans) */
  const flushDrag = useCallback(() => {
    rafId.current = null
    const pd = pendingDrag.current
    pendingDrag.current = null
    if (!pd) return
    const drag = dragRef.current
    const s = store.getState()

    if (drag.kind === 'move') {
      const grid = s.project.settings.gridSize
      let dx = pd.raw.x - drag.startWorld.x
      let dy = pd.raw.y - drag.startWorld.y
      // Shift: hassas mod — ızgaraya yaslamadan serbest taşı
      if (s.project.settings.snapToGrid && !pd.shift) {
        dx = Math.round(dx / grid) * grid
        dy = Math.round(dy / grid) * grid
      }
      if (dx !== 0 || dy !== 0) drag.moved = true
      if (!drag.moved) return
      s.mutateLive((p) => {
        for (const c of p.components) {
          const o = drag.originals.get(c.id)
          if (o && !Array.isArray(o)) { c.x = o.x + dx; c.y = o.y + dy }
        }
        for (const t of p.traces) {
          const o = drag.originals.get(t.id)
          if (o && Array.isArray(o)) t.points = o.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        }
        for (const v of p.vias) {
          const o = drag.originals.get(v.id)
          if (o && !Array.isArray(o)) { v.x = o.x + dx; v.y = o.y + dy }
        }
        for (const t of p.texts) {
          const o = drag.originals.get(t.id)
          if (o && !Array.isArray(o)) { t.x = o.x + dx; t.y = o.y + dy }
        }
        for (const z of p.zones) {
          const o = drag.originals.get(z.id)
          if (o && Array.isArray(o)) z.points = o.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        }
        for (const im of p.images) {
          const o = drag.originals.get(im.id)
          if (o && !Array.isArray(o)) { im.x = o.x + dx; im.y = o.y + dy }
        }
        // Bağlantı takibi — bağlı iz uçları ve vialar
        for (const [traceId, info] of drag.followTraces) {
          const tr = p.traces.find((t) => t.id === traceId)
          if (!tr) continue
          tr.points = info.original.map((pt, i) =>
            info.indices.includes(i) ? { x: pt.x + dx, y: pt.y + dy } : { x: pt.x, y: pt.y }
          )
        }
        for (const [viaId, o] of drag.followVias) {
          const v = p.vias.find((vi) => vi.id === viaId)
          if (v) { v.x = o.x + dx; v.y = o.y + dy }
        }
      })
    } else if (drag.kind === 'vertex') {
      const target = snapMaybe(pd.raw, pd.shift)
      drag.moved = true
      s.mutateLive((p) => {
        const trace = p.traces.find((tr) => tr.id === drag.traceId)
        if (trace && trace.points[drag.index]) trace.points[drag.index] = target
      })
    }
  }, [store, snapMaybe])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const raw = toWorld(e)
      setMouseWorld(raw)
      shiftHeld.current = e.shiftKey
      const drag = dragRef.current

      if (drag.kind === 'pan') {
        // Aynalanmış (arkadan) görünümde X ekseni ters çevrilmiş olduğundan
        // fare hareketi de X'te ters uygulanmalı — aksi halde sürükleme yönü
        // ekranda tersine hissettirir
        const dx = viewFlipped ? -e.movementX : e.movementX
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + e.movementY }))
        return
      }

      // Ağır sürüklemeler (taşıma / vertex) rAF ile kareye bir kez işlenir
      if (drag.kind === 'move' || drag.kind === 'vertex') {
        pendingDrag.current = { raw, shift: e.shiftKey }
        if (rafId.current == null) rafId.current = requestAnimationFrame(flushDrag)
        return
      }

      if (drag.kind === 'marquee') {
        drag.current = raw
        setDragTick((t) => t + 1)
        return
      }
      if (drag.kind === 'measure') {
        const s = store.getState()
        let target = s.project.settings.snapToGrid ? snap(raw) : raw
        // Shift: 45° kilidi
        if (e.shiftKey) target = snap45(drag.start, target)
        drag.current = target
        setDragTick((t) => t + 1)
        return
      }
    },
    [toWorld, store, snap, flushDrag, viewFlipped]
  )

  const onMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      // Bekleyen rAF sürüklemesini son konuma göre uygula
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      if (pendingDrag.current) flushDrag()

      const drag = dragRef.current
      dragRef.current = { kind: 'none' }
      const s = store.getState()

      if (drag.kind === 'move' || drag.kind === 'vertex') {
        if (drag.moved) {
          // Taşıma bitti — bağlı izleri az bozmayla toparla (anlık değil, drop'ta)
          if (drag.kind === 'move' && drag.followTraces.size > 0) {
            const cf = s.project.settings.connectionFollow
            if (cf?.enabled && cf.reflowOnDrop) {
              s.mutateLive((p) => {
                for (const traceId of drag.followTraces.keys()) {
                  const tr = p.traces.find((t) => t.id === traceId)
                  if (tr) tr.points = tidyTrace(tr.points)
                }
              })
            }
          }
          s.endTransaction()
          setAnalysisEpoch((n) => n + 1) // sürükleme bitti → analizi tazele
        } else {
          store.setState({ pendingSnapshot: null })
        }
        return
      }

      if (drag.kind === 'marquee') {
        const r = normRect(drag.start, drag.current)
        if (r.width < 0.01 && r.height < 0.01) return
        const sel = emptySelection()
        for (const c of s.project.components) {
          const fp = s.getFootprint(c.footprintId)
          if (!fp) continue
          const bb = componentBBox(c, fp)
          if (bb.x >= r.x && bb.y >= r.y && bb.x + bb.width <= r.x + r.width && bb.y + bb.height <= r.y + r.height) {
            sel.componentIds.push(c.id)
          }
        }
        for (const t of s.project.traces) {
          if (t.points.every((p) => pointInRect(p, r))) sel.traceIds.push(t.id)
        }
        for (const v of s.project.vias) {
          if (pointInRect(v, r)) sel.viaIds.push(v.id)
        }
        for (const t of s.project.texts) {
          if (pointInRect(t, r)) sel.textIds.push(t.id)
        }
        for (const im of s.project.images) {
          const c = { x: im.x + im.width / 2, y: im.y + im.height / 2 }
          if (pointInRect(c, r)) sel.imageIds.push(im.id)
        }
        s.setSelection(sel)
        const n =
          sel.componentIds.length + sel.traceIds.length + sel.viaIds.length +
          sel.textIds.length + sel.imageIds.length
        if (n > 0) s.setStatus(tr('{n} nesne seçildi', { n }))
        setDragTick((t) => t + 1)
        return
      }

      if (drag.kind === 'measure') {
        setMeasureResult({ a: drag.start, b: drag.current })
        store.setState({ lastMeasure: { a: drag.start, b: drag.current } })
        const len = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y)
        s.setStatus(
          tr('Ölçüm: {len} mm — Δx={dx}, Δy={dy}', {
            len: len.toFixed(3),
            dx: (drag.current.x - drag.start.x).toFixed(2),
            dy: (drag.current.y - drag.start.y).toFixed(2)
          })
        )
        return
      }

    },
    [store, ask, flushDrag]
  )

  // rAF temizliği (bileşen kaldırılırken)
  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
    }
  }, [])

  // Seçili iz değişince / tek iz seçimi kalkınca köşe noktası seçimini temizle
  useEffect(() => {
    if (selection.traceIds.length !== 1) {
      setSelectedVertex(null)
      setVertexMenu(null)
    } else if (selectedVertex && selection.traceIds[0] !== selectedVertex.traceId) {
      setSelectedVertex(null)
      setVertexMenu(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.traceIds])

  /**
   * Seçili bir uç köşe noktasını en yakın pad/via/iz-ucuna taşıyıp bağlar;
   * bağlanılan öğenin neti ize (ve pad'e) aktarılır — "bağlama" işlemi.
   */
  const connectVertex = useCallback(
    (traceId: string, index: number) => {
      const s = store.getState()
      const trace = s.project.traces.find((t) => t.id === traceId)
      if (!trace || !trace.points[index]) return
      const pt = trace.points[index]
      const searchR = Math.max(2.5, 14 / view.scale)
      type Cand = { x: number; y: number; net: string; d: number; compId?: string; padName?: string }
      let best: Cand | null = null
      const consider = (c: Cand) => {
        if (c.d <= searchR && (!best || c.d < best.d)) best = c
      }
      for (const comp of s.project.components) {
        const fp = s.getFootprint(comp.footprintId)
        if (!fp) continue
        for (const pad of fp.pads) {
          if (pad.name.startsWith('MH')) continue
          const c = padWorldPos(comp, pad)
          consider({
            x: c.x, y: c.y, net: comp.padNets[pad.name] ?? '',
            d: Math.hypot(c.x - pt.x, c.y - pt.y), compId: comp.id, padName: pad.name
          })
        }
      }
      for (const v of s.project.vias) {
        consider({ x: v.x, y: v.y, net: v.net, d: Math.hypot(v.x - pt.x, v.y - pt.y) })
      }
      for (const t of s.project.traces) {
        if (t.id === traceId || t.layer !== trace.layer) continue
        for (const ei of [0, t.points.length - 1]) {
          const ep = t.points[ei]
          consider({ x: ep.x, y: ep.y, net: t.net, d: Math.hypot(ep.x - pt.x, ep.y - pt.y) })
        }
      }
      const b = best as Cand | null
      if (!b) {
        s.setStatus(tr('Yakında bağlanacak pad/uç bulunamadı (yaklaştırıp tekrar deneyin)'))
        return
      }
      s.commit((p) => {
        const t2 = p.traces.find((t) => t.id === traceId)
        if (!t2) return
        t2.points[index] = { x: b.x, y: b.y }
        const finalNet = t2.net || b.net
        if (finalNet) t2.net = finalNet
        if (b.compId && b.padName && finalNet) {
          const comp = p.components.find((c) => c.id === b.compId)
          if (comp && !comp.padNets[b.padName!]) comp.padNets[b.padName!] = finalNet
        }
      }, tr('Nokta en yakın bağlantıya bağlandı'))
      setSelectedVertex(null)
    },
    [store, view.scale]
  )

  const onDoubleClick = useCallback(
    async (e: React.MouseEvent) => {
      const s = store.getState()
      if (s.tool === 'trace' && s.drawingTrace) {
        s.finishTrace()
        return
      }
      if (s.tool === 'zone' && s.drawingZone) {
        if (s.drawingZone.length < 3) {
          s.cancelZoneDraw()
          return
        }
        const net = await ask(tr('Bakır alan net adı'), 'GND', tr('Genellikle GND'))
        if (net === null) {
          s.cancelZoneDraw()
          return
        }
        s.finishZoneDraw(net)
        return
      }
      if (s.tool === 'board-shape' && s.drawingBoardOutline) {
        s.finishBoardOutline()
        return
      }
      // Seçim modunda: seçili iz üzerinde çift tık → araya köşe noktası ekle
      if (s.tool === 'select' && s.selection.traceIds.length === 1) {
        const raw = toWorld(e)
        const trace = s.project.traces.find((t) => t.id === s.selection.traceIds[0])
        if (trace) {
          const vertexTol = 6 / view.scale
          const vertexIdx = trace.points.findIndex(
            (p) => Math.hypot(p.x - raw.x, p.y - raw.y) <= vertexTol
          )
          if (vertexIdx >= 0) {
            // Mevcut köşe noktasına çift tık → noktayı kaldır (en az 2 nokta kalmalı)
            if (trace.points.length > 2) {
              s.commit((p) => {
                const tr = p.traces.find((t) => t.id === trace.id)
                if (tr) tr.points.splice(vertexIdx, 1)
              }, tr('İz köşe noktası silindi'))
            }
          } else {
            let bestIdx = -1
            let bestDist = tolWorld
            for (let i = 0; i < trace.points.length - 1; i++) {
              const d = segPointDist(trace.points[i], trace.points[i + 1], raw)
              if (d < bestDist) {
                bestDist = d
                bestIdx = i
              }
            }
            if (bestIdx >= 0) {
              const insertAt = bestIdx + 1
              s.commit((p) => {
                const tr = p.traces.find((t) => t.id === trace.id)
                if (tr) tr.points.splice(insertAt, 0, raw)
              }, tr('İz köşe noktası eklendi'))
            }
          }
        }
      }
    },
    [store, toWorld, view.scale, tolWorld, ask]
  )

  // ── Klavye kısayolları ──
  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      const s = store.getState()
      // Bir diyalog açıkken editör kısayolları (undo/sil vb.) çalışmasın
      if (s.activeDialog) return

      if (e.key === 'Shift') shiftHeld.current = true

      if (e.key === ' ') {
        spaceHeld.current = true
        e.preventDefault()
        return
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) s.redo()
            else s.undo()
            return
          case 'y':
            e.preventDefault()
            s.redo()
            return
          case 'c':
            e.preventDefault()
            s.copySelection()
            return
          case 'v':
            e.preventDefault()
            if (mouseWorld) s.paste(snap(mouseWorld))
            return
          case 'a': {
            e.preventDefault()
            const sel = emptySelection()
            sel.componentIds = s.project.components.map((c) => c.id)
            sel.traceIds = s.project.traces.map((t) => t.id)
            sel.viaIds = s.project.vias.map((v) => v.id)
            sel.textIds = s.project.texts.map((t) => t.id)
            sel.zoneIds = s.project.zones.map((z) => z.id)
            sel.imageIds = s.project.images.map((im) => im.id)
            s.setSelection(sel)
            return
          }
        }
        return
      }

      switch (e.key) {
        case 'Escape':
          setVertexMenu(null)
          if (selectedVertex) { setSelectedVertex(null); break }
          if (s.drawingTrace) s.cancelTrace()
          else if (s.drawingBoardOutline) s.cancelBoardOutline()
          else if (s.drawingZone) s.cancelZoneDraw()
          else if (s.placingFootprintId) s.startPlacing(null)
          else if (s.placingImage) s.startPlacingImage(null)
          else s.clearSelection()
          break
        case 'Enter':
          if (s.drawingTrace) s.finishTrace()
          else if (s.drawingBoardOutline) s.finishBoardOutline()
          else if (s.drawingZone) {
            if (s.drawingZone.length < 3) { s.cancelZoneDraw(); break }
            const net = await ask(tr('Bakır alan net adı'), 'GND', tr('Genellikle GND'))
            if (net === null) s.cancelZoneDraw()
            else s.finishZoneDraw(net)
          }
          break
        case 'Delete':
        case 'Backspace':
          // Tek köşe noktası seçiliyse yalnız onu sil, yoksa tüm seçimi
          if (selectedVertex) {
            s.deleteTraceVertex(selectedVertex.traceId, selectedVertex.index)
            setSelectedVertex(null)
          } else {
            s.deleteSelection()
          }
          break
        case 'r':
        case 'R':
          s.rotateSelection()
          break
        case 'f':
        case 'F':
          s.flipSelection()
          break
        case 't':
        case 'T':
          s.setTool('trace')
          break
        case 's':
        case 'S':
          s.setTool('select')
          break
        case 'v':
        case 'V':
          if (s.drawingTrace && snappedCursor) {
            s.switchTraceLayer(snappedCursor)
          } else {
            s.setTool('via')
          }
          break
        case 'm':
        case 'M':
          s.setTool('measure')
          break
        case 'n':
        case 'N':
          s.setTool('net')
          break
        case '1':
          s.setActiveLayer('top')
          break
        case '2':
          s.setActiveLayer('bottom')
          break
        case 'g':
        case 'G': {
          const grids = [2.54, 1.27, 0.635, 0.5, 0.25, 0.1]
          const cur = s.project.settings.gridSize
          const idx = grids.findIndex((g) => Math.abs(g - cur) < 0.001)
          const next = grids[(idx + 1) % grids.length]
          s.commit((p) => {
            p.settings.gridSize = next
          }, `Izgara: ${next} mm`)
          break
        }
        case 'Home':
          setView(fitBoardView(s.project, size.w, size.h))
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceHeld.current = false
      if (e.key === 'Shift') shiftHeld.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [store, mouseWorld, snap, snappedCursor, size, selectedVertex, ask])

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onMouseLeave={() => {
          setMouseWorld(null)
          if (dragRef.current.kind === 'pan') dragRef.current = { kind: 'none' }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <CursorReadout mouseWorld={mouseWorld} airwireCount={analysis.airwires.length} shortCount={analysis.shorts.length} />
      {netPopover && (() => {
        const comp = project.components.find((c) => c.id === netPopover.compId)
        if (!comp) return null
        return (
          <NetPopover
            x={netPopover.x}
            y={netPopover.y}
            refDes={comp.refDes}
            padName={netPopover.padName}
            current={comp.padNets[netPopover.padName] ?? ''}
            suggest={suggestNetName(netPopover.padName)}
            onApply={(net) => {
              store.getState().assignNet(netPopover.compId, netPopover.padName, net.trim())
              setNetPopover(null)
            }}
            onClose={() => setNetPopover(null)}
          />
        )
      })()}
      {vertexMenu && (
        <VertexContextMenu
          menu={vertexMenu}
          onClose={() => setVertexMenu(null)}
          onDelete={() => {
            store.getState().deleteTraceVertex(vertexMenu.traceId, vertexMenu.index)
            setSelectedVertex(null)
            setVertexMenu(null)
          }}
          onSplit={() => {
            store.getState().splitTraceAt(vertexMenu.traceId, vertexMenu.index)
            setSelectedVertex(null)
            setVertexMenu(null)
          }}
          onConnect={() => {
            connectVertex(vertexMenu.traceId, vertexMenu.index)
            setVertexMenu(null)
          }}
        />
      )}
    </div>
  )
}

/** Seçili iz köşe noktası için sağ tık bağlam menüsü */
function VertexContextMenu({
  menu,
  onClose,
  onDelete,
  onSplit,
  onConnect
}: {
  menu: { x: number; y: number; index: number; isEndpoint: boolean }
  onClose: () => void
  onDelete: () => void
  onSplit: () => void
  onConnect: () => void
}) {
  const t = useT()
  return (
    <>
      <div
        className="context-menu-backdrop"
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      <div className="context-menu" style={{ left: menu.x, top: menu.y }}>
        <div className="context-menu-title">{t('Köşe noktası')} #{menu.index + 1}</div>
        <button onClick={onDelete}>🗑 {t('Noktayı sil')}</button>
        {!menu.isEndpoint && (
          <button onClick={onSplit}>✂ {t('İzi buradan böl')}</button>
        )}
        {menu.isEndpoint && (
          <button onClick={onConnect}>🔗 {t('En yakın pad/uca bağla')}</button>
        )}
      </div>
    </>
  )
}

function CursorReadout({
  mouseWorld,
  airwireCount,
  shortCount
}: {
  mouseWorld: Point | null
  airwireCount: number
  shortCount: number
}) {
  const t = useT()
  return (
    <div className="cursor-readout">
      {mouseWorld && (
        <span>
          X: {mouseWorld.x.toFixed(2)} &nbsp; Y: {mouseWorld.y.toFixed(2)} mm
        </span>
      )}
      <span className={airwireCount > 0 ? 'warn' : 'ok'}>
        {airwireCount > 0
          ? '⚡ ' + t('{n} eksik bağlantı', { n: airwireCount })
          : '✓ ' + t('tüm bağlantılar tamam')}
      </span>
      {shortCount > 0 && (
        <span className="err">⛔ {t('{n} kısa devre!', { n: shortCount })}</span>
      )}
    </div>
  )
}

// ─── Seçim yardımcıları ───────────────────────────────────────────────────

function isSelected(sel: Selection, hit: NonNullable<ReturnType<typeof hitTest>>): boolean {
  switch (hit.type) {
    case 'pad':
    case 'component':
      return sel.componentIds.includes(hit.type === 'pad' ? hit.componentId : hit.id)
    case 'trace':
      return sel.traceIds.includes(hit.id)
    case 'via':
      return sel.viaIds.includes(hit.id)
    case 'text':
      return sel.textIds.includes(hit.id)
    case 'zone':
      return sel.zoneIds.includes(hit.id)
    case 'image':
      return sel.imageIds.includes(hit.id)
  }
}

function toggleInSelection(sel: Selection, hit: NonNullable<ReturnType<typeof hitTest>>) {
  const toggle = (arr: string[], id: string) => {
    const i = arr.indexOf(id)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(id)
  }
  switch (hit.type) {
    case 'pad':
      toggle(sel.componentIds, hit.componentId)
      break
    case 'component':
      toggle(sel.componentIds, hit.id)
      break
    case 'trace':
      toggle(sel.traceIds, hit.id)
      break
    case 'via':
      toggle(sel.viaIds, hit.id)
      break
    case 'text':
      toggle(sel.textIds, hit.id)
      break
    case 'zone':
      toggle(sel.zoneIds, hit.id)
      break
    case 'image':
      toggle(sel.imageIds, hit.id)
      break
  }
}

function normRect(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  }
}
