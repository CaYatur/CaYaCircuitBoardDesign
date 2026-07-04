// ─── Kart dış hattı geometrisi ────────────────────────────────────────────
// Serbest (polygon) kart dış hattı için köşe yuvarlatma (fillet) ve düzenleme
// yardımcıları. Hem canvas render'ı hem dışa aktarım aynı noktaları kullanır.

import type { BoardOutline, Point } from '../types'

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const len = (p: Point): number => Math.hypot(p.x, p.y)
const norm = (p: Point): Point => {
  const l = len(p) || 1
  return { x: p.x / l, y: p.y / l }
}
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Poligona köşe yuvarlatma (fillet) uygular ve yoğunlaştırılmış (yay örneklenmiş)
 * kapalı bir nokta listesi döndürür. `radii` her köşe için yarıçap (mm); yoksa 0.
 */
export function filletPolygon(points: Point[], radii?: number[], steps = 10): Point[] {
  const n = points.length
  if (n < 3) return points.map((p) => ({ ...p }))
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const r = radii?.[i] ?? 0
    const P1 = points[i]
    if (r <= 0.001) {
      out.push({ ...P1 })
      continue
    }
    const P0 = points[(i - 1 + n) % n]
    const P2 = points[(i + 1) % n]
    const v1 = norm(sub(P0, P1))
    const v2 = norm(sub(P2, P1))
    const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y))
    const angle = Math.acos(dot) // köşedeki iç açı (kenarlar arası)
    if (angle < 0.02 || angle > Math.PI - 0.02) {
      out.push({ ...P1 })
      continue
    }
    let t = r / Math.tan(angle / 2)
    t = Math.min(t, dist(P0, P1) / 2, dist(P1, P2) / 2)
    const rr = t * Math.tan(angle / 2)
    if (rr <= 0.001) {
      out.push({ ...P1 })
      continue
    }
    const tp1 = { x: P1.x + v1.x * t, y: P1.y + v1.y * t }
    const bis = norm({ x: v1.x + v2.x, y: v1.y + v2.y })
    const centerDist = rr / Math.sin(angle / 2)
    const C = { x: P1.x + bis.x * centerDist, y: P1.y + bis.y * centerDist }
    const a1 = Math.atan2(tp1.y - C.y, tp1.x - C.x)
    const tp2 = { x: P1.x + v2.x * t, y: P1.y + v2.y * t }
    const a2 = Math.atan2(tp2.y - C.y, tp2.x - C.x)
    let da = a2 - a1
    while (da > Math.PI) da -= 2 * Math.PI
    while (da < -Math.PI) da += 2 * Math.PI
    for (let s = 0; s <= steps; s++) {
      const a = a1 + (da * s) / steps
      out.push({ x: C.x + Math.cos(a) * rr, y: C.y + Math.sin(a) * rr })
    }
  }
  return out
}

/**
 * Kartı düzenlenebilir poligona çevirir: köşe noktaları + yarıçaplar.
 * rect/circle/oval için makul köşe noktaları üretir (böylece kart editöründe
 * serbestçe düzenlenebilir hâle gelir).
 */
export function boardEditablePolygon(board: BoardOutline): { points: Point[]; radii: number[] } {
  if (board.shape === 'polygon' && board.points && board.points.length >= 3) {
    const points = board.points.map((p) => ({ ...p }))
    const radii = points.map((_, i) => board.vertexRadii?.[i] ?? 0)
    return { points, radii }
  }
  const w = board.width
  const h = board.height
  if (board.shape === 'circle' || board.shape === 'oval') {
    // Sekizgen yaklaşımı — düzenlenebilir; kullanıcı isterse noktaları oynatır
    const rx = w / 2
    const ry = h / 2
    const steps = 12
    const points: Point[] = []
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      points.push({ x: rx + rx * Math.cos(a), y: ry + ry * Math.sin(a) })
    }
    return { points, radii: points.map(() => 0) }
  }
  // rect — köşe yuvarlatma varsa vertexRadii olarak taşı
  const cr = board.cornerRadius || 0
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ]
  return { points, radii: points.map(() => cr) }
}

/** Kart dış hattının son (yay uygulanmış) kapalı poligon noktaları — polygon şekli için */
export function polygonOutlinePoints(board: BoardOutline): Point[] {
  if (!board.points || board.points.length < 3) return []
  const filleted = filletPolygon(board.points, board.vertexRadii)
  return [...filleted, filleted[0]]
}

/** Bir kesim şeklinin kapalı sınır noktaları (mm) */
export function cutoutOutlinePoints(
  cut: { shape: 'rect' | 'circle'; x: number; y: number; width: number; height: number; cornerRadius?: number }
): Point[] {
  if (cut.shape === 'circle') {
    const r = cut.width / 2
    const steps = 48
    const pts: Point[] = []
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      pts.push({ x: cut.x + r * Math.cos(a), y: cut.y + r * Math.sin(a) })
    }
    return pts
  }
  const { x, y, width: w, height: h } = cut
  const r = Math.min(cut.cornerRadius ?? 0, w / 2, h / 2)
  if (r <= 0.01) {
    return [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }
    ]
  }
  const pts = filletPolygon(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ],
    [r, r, r, r]
  )
  return [...pts, pts[0]]
}

/** İki nokta arası mesafe (ölçü etiketi için) */
export const edgeLength = (a: Point, b: Point): number => dist(a, b)
