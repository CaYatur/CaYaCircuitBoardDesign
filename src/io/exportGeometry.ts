// ─── Dışa aktarım geometrisi ──────────────────────────────────────────────
// Gerber, SVG, G-code ve PNG dışa aktarımlarının ortak kullandığı katman
// bazlı geometri ilkelleri (stroke / flash / region).

import type { CopperLayer, Footprint, Point, Project } from '../types'
import { localToWorld, padWorldPos, padWorldSize } from '../core/geometry'
import { polygonOutlinePoints } from '../core/boardGeometry'
import { placeText } from '../render/vectorFont'

export interface StrokeItem {
  kind: 'stroke'
  points: Point[]
  width: number
  net: string
}

export interface FlashItem {
  kind: 'flash'
  shape: 'circle' | 'rect' | 'oval'
  x: number
  y: number
  width: number
  height: number
  net: string
}

export interface RegionItem {
  kind: 'region'
  x: number
  y: number
  width: number
  height: number
  net: string
  clearance: number
}

export type CopperPrimitive = StrokeItem | FlashItem

export interface CopperLayerGeometry {
  /** Bakır dolgu alanları (önce çizilir, diğer netlerin çevresi boşaltılır) */
  zones: RegionItem[]
  /** İzler, pad'ler, vialar */
  copper: CopperPrimitive[]
}

/** Bir bakır katmandaki tüm ilkelleri toplar */
export function copperLayerGeometry(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer
): CopperLayerGeometry {
  const copper: CopperPrimitive[] = []

  for (const trace of project.traces) {
    if (trace.layer !== layer) continue
    copper.push({
      kind: 'stroke',
      points: trace.points,
      width: trace.width,
      net: trace.net
    })
  }

  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      const isTht = !!pad.drill || pad.layer === 'both'
      if (!isTht) {
        const effLayer =
          comp.side === 'bottom'
            ? pad.layer === 'top' ? 'bottom' : 'top'
            : pad.layer
        if (effLayer !== layer) continue
      }
      const pos = padWorldPos(comp, pad)
      const { width, height } = padWorldSize(comp, pad)
      copper.push({
        kind: 'flash',
        shape: pad.shape,
        x: pos.x,
        y: pos.y,
        width,
        height,
        net: comp.padNets[pad.name] ?? ''
      })
    }
  }

  for (const via of project.vias) {
    copper.push({
      kind: 'flash',
      shape: 'circle',
      x: via.x,
      y: via.y,
      width: via.diameter,
      height: via.diameter,
      net: via.net
    })
  }

  const zones: RegionItem[] = project.zones
    .filter((z) => z.layer === layer)
    .map((z) => ({
      kind: 'region',
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      net: z.net,
      clearance: z.clearance
    }))

  return { zones, copper }
}

/** Silkscreen katmanı: çizgiler (stroke) listesi */
export function silkLayerGeometry(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer
): StrokeItem[] {
  const strokes: StrokeItem[] = []

  const circlePoints = (cx: number, cy: number, r: number): Point[] => {
    const pts: Point[] = []
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
    return pts
  }

  for (const comp of project.components) {
    if (comp.side !== side) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const el of fp.silk) {
      if (el.kind === 'line') {
        strokes.push({
          kind: 'stroke',
          points: [
            localToWorld(comp, { x: el.x1, y: el.y1 }),
            localToWorld(comp, { x: el.x2, y: el.y2 })
          ],
          width: el.width,
          net: ''
        })
      } else if (el.kind === 'circle') {
        const c = localToWorld(comp, { x: el.cx, y: el.cy })
        strokes.push({
          kind: 'stroke',
          points: circlePoints(c.x, c.y, el.r),
          width: el.width,
          net: ''
        })
      } else {
        const anchor = localToWorld(comp, { x: el.x, y: el.y })
        const { strokes: textStrokes, strokeWidth } = placeText(
          el.text, anchor, el.size, comp.rotation, comp.side === 'bottom'
        )
        for (const pts of textStrokes) {
          strokes.push({ kind: 'stroke', points: pts, width: strokeWidth, net: '' })
        }
      }
    }
    // RefDes etiketi
    if (comp.refDes) {
      const { strokes: textStrokes, strokeWidth } = placeText(
        comp.refDes,
        { x: comp.x, y: comp.y - (fp.body.height / 2 + 1.2) },
        1.1,
        0,
        side === 'bottom'
      )
      for (const pts of textStrokes) {
        strokes.push({ kind: 'stroke', points: pts, width: strokeWidth, net: '' })
      }
    }
  }

  const textLayer = side === 'top' ? 'top-silk' : 'bottom-silk'
  for (const t of project.texts) {
    if (t.layer !== textLayer) continue
    const { strokes: textStrokes, strokeWidth } = placeText(
      t.text, t, t.size, t.rotation, side === 'bottom', 'center', { font: t.font }
    )
    const width = strokeWidth * (t.bold ? 1.9 : 1)
    for (const pts of textStrokes) {
      strokes.push({ kind: 'stroke', points: pts, width, net: '' })
    }
  }

  return strokes
}

/** Kart dış hattı: şekle göre polyline (rect: yuvarlatılmış köşeli; circle/oval: elips; polygon: serbest çizim) */
export function outlinePoints(project: Project): Point[] {
  const { board } = project
  const w = board.width
  const h = board.height

  if (board.shape === 'polygon' && board.points && board.points.length >= 3) {
    return polygonOutlinePoints(board)
  }

  if (board.shape === 'circle' || board.shape === 'oval') {
    const rx = w / 2
    const ry = h / 2
    const steps = 64
    const pts: Point[] = []
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      pts.push({ x: rx + rx * Math.cos(a), y: ry + ry * Math.sin(a) })
    }
    return pts
  }

  const r = Math.min(board.cornerRadius, w / 2, h / 2)
  if (r <= 0.01) {
    return [
      { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: 0 }
    ]
  }
  const pts: Point[] = []
  const arc = (cx: number, cy: number, start: number, end: number) => {
    const steps = 8
    for (let i = 0; i <= steps; i++) {
      const a = start + ((end - start) * i) / steps
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
  }
  arc(r, r, Math.PI, Math.PI * 1.5) // sol üst
  arc(w - r, r, Math.PI * 1.5, Math.PI * 2) // sağ üst
  arc(w - r, h - r, 0, Math.PI * 0.5) // sağ alt
  arc(r, h - r, Math.PI * 0.5, Math.PI) // sol alt
  pts.push(pts[0])
  return pts
}

export interface DrillHole {
  x: number
  y: number
  diameter: number
}

/** Tüm delikler: pad delikleri, vialar, montaj delikleri */
export function allDrills(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): DrillHole[] {
  const drills: DrillHole[] = []
  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (!pad.drill) continue
      const pos = padWorldPos(comp, pad)
      drills.push({ x: pos.x, y: pos.y, diameter: pad.drill })
    }
  }
  for (const via of project.vias) {
    drills.push({ x: via.x, y: via.y, diameter: via.drill })
  }
  for (const h of project.board.mountingHoles) {
    drills.push({ x: h.x, y: h.y, diameter: h.drill })
  }
  return drills
}
