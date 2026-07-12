// ─── Geometri motoru ──────────────────────────────────────────────────────
// Tüm bakır nesneler "kapsül" (yuvarlatılmış uçlu segment) veya daire olarak
// modellenir; mesafe/çakışma hesapları bu iki ilkel üzerinden yapılır.

import type {
  ComponentInstance,
  CopperLayer,
  Footprint,
  PadDef,
  Point,
  Rotation
} from '../types'

export const dist = (a: Point, b: Point): number =>
  Math.hypot(b.x - a.x, b.y - a.y)

/** Nokta ile doğru parçası arasındaki en kısa mesafe */
export function segPointDist(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(a, p)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}

/** İki doğru parçası arasındaki en kısa mesafe (kesişiyorsa 0) */
export function segSegDist(p1: Point, p2: Point, p3: Point, p4: Point): number {
  if (segmentsIntersect(p1, p2, p3, p4)) return 0
  return Math.min(
    segPointDist(p1, p2, p3),
    segPointDist(p1, p2, p4),
    segPointDist(p3, p4, p1),
    segPointDist(p3, p4, p2)
  )
}

/** Kapsül: yuvarlatılmış uçlu segment. x1==x2 && y1==y2 ise dairedir. */
export interface Capsule {
  x1: number
  y1: number
  x2: number
  y2: number
  r: number
}

export const circleCapsule = (x: number, y: number, r: number): Capsule => ({
  x1: x, y1: y, x2: x, y2: y, r
})

/** İki kapsül arasındaki boşluk; negatifse çakışıyorlar */
export function capsuleGap(a: Capsule, b: Capsule): number {
  return (
    segSegDist(
      { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 },
      { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }
    ) - a.r - b.r
  )
}

export const capsulesTouch = (a: Capsule, b: Capsule, tol = 1e-3): boolean =>
  capsuleGap(a, b) <= tol

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y

/** Kapsül ile eksenlere paralel dikdörtgen arasındaki boşluk (kaba: uç örnekleme) */
export function capsuleRectGap(c: Capsule, r: Rect): number {
  // Dikdörtgenin 4 kenarını segment olarak ele al
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height }
  ]
  const a = { x: c.x1, y: c.y1 }
  const b = { x: c.x2, y: c.y2 }
  // Kapsül merkez hattı dikdörtgenin içindeyse çakışma kesin
  if (pointInRect(a, r) || pointInRect(b, r)) return -c.r
  let min = Infinity
  for (let i = 0; i < 4; i++) {
    const d = segSegDist(a, b, corners[i], corners[(i + 1) % 4])
    if (d < min) min = d
  }
  return min - c.r
}

/** Nokta serbest poligonun içinde mi? (ışın yöntemi) */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Kapsül ile serbest poligon arasındaki boşluk (kapsül merkez hattı poligon
 *  içindeyse çakışma kesin → negatif) — capsuleRectGap'in poligon genellemesi */
export function capsulePolygonGap(c: Capsule, poly: Point[]): number {
  const a = { x: c.x1, y: c.y1 }
  const b = { x: c.x2, y: c.y2 }
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return -c.r
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const d = segSegDist(a, b, poly[i], poly[(i + 1) % poly.length])
    if (d < min) min = d
  }
  return min - c.r
}

// ─── Dönüşümler ───────────────────────────────────────────────────────────

/** Noktayı verilen açıyla (90° adım) döndür */
export function rotatePoint(p: Point, rot: Rotation): Point {
  switch (rot) {
    case 0: return { x: p.x, y: p.y }
    case 90: return { x: -p.y, y: p.x }
    case 180: return { x: -p.x, y: -p.y }
    case 270: return { x: p.y, y: -p.x }
  }
}

/**
 * Footprint yerel koordinatını dünya koordinatına çevirir.
 * Alt yüzdeki komponentler X ekseninde aynalanır (üstten bakış).
 */
export function localToWorld(comp: ComponentInstance, p: Point): Point {
  const mirrored = comp.side === 'bottom' ? { x: -p.x, y: p.y } : p
  const rotated = rotatePoint(mirrored, comp.rotation)
  return { x: rotated.x + comp.x, y: rotated.y + comp.y }
}

/**
 * Footprint-yerel bir yayın (a0,a1 radyan) başlangıç/bitiş açılarını
 * komponentin yüzüne (mirror) ve dönüşüne göre dünya açılarına çevirir.
 * Alt yüzdeki ayna simetrisi süpürme yönünü de ters çevirdiğinden, canvas
 * arc'ın hep artan açı yönünde çizdiği aynı görsel yayı elde etmek için
 * uçlar yer değiştirir.
 */
export function transformArcAngles(
  a0: number,
  a1: number,
  comp: ComponentInstance
): [number, number] {
  const rot = (comp.rotation * Math.PI) / 180
  const mirror = comp.side === 'bottom'
  const map = (a: number) => (mirror ? Math.PI - a : a) + rot
  const p0 = map(a0)
  const p1 = map(a1)
  return mirror ? [p1, p0] : [p0, p1]
}

/** Pad bakırının dünya konumunu döndürür; THT pad'de ofset sarı halkaya aittir. */
export const padWorldPos = (comp: ComponentInstance, pad: PadDef): Point =>
  localToWorld(comp, { x: pad.x + (pad.holeDx ?? 0), y: pad.y + (pad.holeDy ?? 0) })

/** Pad deliğinin (drill) dünya konumu. Delik, pad'in x/y merkezinde sabittir. */
export const padDrillWorldPos = (comp: ComponentInstance, pad: PadDef): Point =>
  localToWorld(comp, { x: pad.x, y: pad.y })

/** Pad'in dünya geometrisi: 90/270 dönüşte en/boy yer değiştirir */
export function padWorldSize(
  comp: ComponentInstance,
  pad: PadDef
): { width: number; height: number } {
  if (comp.rotation === 90 || comp.rotation === 270) {
    return { width: pad.height, height: pad.width }
  }
  return { width: pad.width, height: pad.height }
}

/** Pad'i kapsül olarak temsil et (rect/oval → stadyum, circle → daire) */
export function padCapsule(comp: ComponentInstance, pad: PadDef): Capsule {
  const pos = padWorldPos(comp, pad)
  const { width, height } = padWorldSize(comp, pad)
  if (pad.shape === 'circle' || width === height) {
    return circleCapsule(pos.x, pos.y, Math.max(width, height) / 2)
  }
  if (width > height) {
    const half = (width - height) / 2
    return { x1: pos.x - half, y1: pos.y, x2: pos.x + half, y2: pos.y, r: height / 2 }
  }
  const half = (height - width) / 2
  return { x1: pos.x, y1: pos.y - half, x2: pos.x, y2: pos.y + half, r: width / 2 }
}

/** Pad'in bulunduğu bakır katman(lar)ı — komponentin yüzüne göre çözülür */
export function padCopperLayers(
  comp: ComponentInstance,
  pad: PadDef
): CopperLayer[] {
  if (pad.layer === 'both' || pad.drill) return ['top', 'bottom']
  // SMD pad: komponent alt yüze konduysa pad de alt bakırda
  const layer = comp.side === 'bottom'
    ? (pad.layer === 'top' ? 'bottom' : 'top')
    : pad.layer
  return [layer]
}

/** Komponentin dünya koordinatlarında sınır kutusu */
export function componentBBox(comp: ComponentInstance, fp: Footprint): Rect {
  const corners: Point[] = [
    { x: fp.body.x, y: fp.body.y },
    { x: fp.body.x + fp.body.width, y: fp.body.y },
    { x: fp.body.x + fp.body.width, y: fp.body.y + fp.body.height },
    { x: fp.body.x, y: fp.body.y + fp.body.height }
  ].map((p) => localToWorld(comp, p))
  // Pad'ler gövdeden taşabilir; onları da dahil et
  for (const pad of fp.pads) {
    const pos = padWorldPos(comp, pad)
    const { width, height } = padWorldSize(comp, pad)
    corners.push({ x: pos.x - width / 2, y: pos.y - height / 2 })
    corners.push({ x: pos.x + width / 2, y: pos.y + height / 2 })
  }
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY
  }
}

// ─── İsabet testleri (seçim için) ─────────────────────────────────────────

export function hitTrace(
  p: Point,
  points: Point[],
  width: number,
  tol = 0.1
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (segPointDist(points[i], points[i + 1], p) <= width / 2 + tol) return true
  }
  return false
}

export const hitCircle = (p: Point, cx: number, cy: number, r: number): boolean =>
  Math.hypot(p.x - cx, p.y - cy) <= r

/** 45° açı kilidi: b noktasını a'ya göre en yakın 45° doğrultusuna yansıt */
export function snap45(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx > 2 * ady) return { x: b.x, y: a.y } // yatay
  if (ady > 2 * adx) return { x: a.x, y: b.y } // dikey
  // 45° çapraz
  const m = Math.max(adx, ady)
  const d = Math.min(adx, ady) + (m - Math.min(adx, ady)) / 2
  return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d }
}

/** Izgaraya yasla */
export const snapToGrid = (v: number, grid: number): number =>
  Math.round(v / grid) * grid

export const snapPoint = (p: Point, grid: number): Point => ({
  x: snapToGrid(p.x, grid),
  y: snapToGrid(p.y, grid)
})

/** Polyline toplam uzunluğu */
export function polylineLength(points: Point[]): number {
  let len = 0
  for (let i = 0; i < points.length - 1; i++) len += dist(points[i], points[i + 1])
  return len
}
