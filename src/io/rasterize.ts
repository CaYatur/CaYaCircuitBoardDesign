// ─── Bakır katman rasterleştirme + kontur çıkarma ─────────────────────────
// CNC izolasyon frezeleme yolları, bakır geometrisinin bitmap'e çizilip
// marching squares ile konturlarının çıkarılmasıyla üretilir. Bu yöntem
// kesişen izler, pad'ler ve bakır alanlar için doğru sonuç verir.

import type { CopperLayer, Footprint, Point, Project } from '../types'
import { copperLayerGeometry, type CopperPrimitive } from './exportGeometry'

/** Bakır katmanı bitmap'e çizer (beyaz = bakır, siyah = boş) */
export function rasterizeCopper(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer,
  pxPerMm: number,
  inflateMm = 0
): { canvas: HTMLCanvasElement; pxPerMm: number } {
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.scale(pxPerMm, pxPerMm)

  const geo = copperLayerGeometry(project, getFootprint, layer)

  const drawItem = (item: CopperPrimitive, color: string, inflate: number) => {
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (item.kind === 'stroke') {
      ctx.lineWidth = item.width + 2 * inflate
      ctx.beginPath()
      ctx.moveTo(item.points[0].x, item.points[0].y)
      for (const p of item.points.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    } else {
      const iw = item.width + 2 * inflate
      const ih = item.height + 2 * inflate
      if (item.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(item.x, item.y, Math.max(iw, ih) / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (item.shape === 'oval') {
        const r = Math.min(iw, ih) / 2
        ctx.beginPath()
        // Yuvarlatılmış dikdörtgen (stadyum)
        roundedRectPath(ctx, item.x - iw / 2, item.y - ih / 2, iw, ih, r)
        ctx.fill()
      } else {
        ctx.fillRect(item.x - iw / 2, item.y - ih / 2, iw, ih)
      }
    }
  }

  // 1) Bakır alanlar (inflate uygulanır — takım yarıçapı)
  for (const z of geo.zones) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(z.x - inflateMm, z.y - inflateMm, z.width + 2 * inflateMm, z.height + 2 * inflateMm)
  }
  // 2) Farklı netlerin çevresini boşalt
  if (geo.zones.length > 0) {
    const clearance = Math.max(...geo.zones.map((z) => z.clearance))
    for (const item of geo.copper) {
      const sameNet = geo.zones.every((z) => z.net !== '' && item.net === z.net)
      // Boşluk, takım yarıçapı ŞİŞİRİLMEDEN çizilir ki izolasyon kanalı doğru kalsın
      if (!sameNet) drawItem(item, '#000', clearance - inflateMm)
    }
  }
  // 3) Tüm bakır (takım yarıçapı kadar şişirilmiş)
  for (const item of geo.copper) {
    drawItem(item, '#fff', inflateMm)
  }

  return { canvas, pxPerMm }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Marching squares ile beyaz bölgelerin konturlarını çıkarır.
 * Dönen konturlar mm cinsindendir.
 */
export function extractContours(
  canvas: HTMLCanvasElement,
  pxPerMm: number
): Point[][] {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, w, h).data

  // Binary örnekleme: kenarlarda taşma olmaması için 1 px kenar boşluğu
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0
    return data[(y * w + x) * 4] > 127 ? 1 : 0
  }

  // Segmentleri topla: her hücre için marching squares
  // Kenar orta noktaları: üst(x+0.5,y), sağ(x+1,y+0.5), alt(x+0.5,y+1), sol(x,y+0.5)
  const segments: [number, number, number, number][] = []
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y)
      const tr = at(x + 1, y)
      const br = at(x + 1, y + 1)
      const bl = at(x, y + 1)
      const idx = tl * 8 + tr * 4 + br * 2 + bl
      if (idx === 0 || idx === 15) continue
      const T: [number, number] = [x + 1, y + 0.5]
      const R: [number, number] = [x + 1.5, y + 1]
      const B: [number, number] = [x + 1, y + 1.5]
      const L: [number, number] = [x + 0.5, y + 1]
      const add = (a: [number, number], b: [number, number]) =>
        segments.push([a[0], a[1], b[0], b[1]])
      switch (idx) {
        case 1: add(L, B); break
        case 2: add(B, R); break
        case 3: add(L, R); break
        case 4: add(T, R); break
        case 5: add(T, L); add(B, R); break
        case 6: add(T, B); break
        case 7: add(T, L); break // ~= case 8 ters
        case 8: add(L, T); break
        case 9: add(B, T); break
        case 10: add(L, B); add(T, R); break
        case 11: add(R, T); break
        case 12: add(R, L); break
        case 13: add(B, R); break // ters yönlü
        case 14: add(L, B); break
      }
    }
  }

  // Segmentleri zincirle
  const key = (x: number, y: number) => `${Math.round(x * 2)}_${Math.round(y * 2)}`
  const adj = new Map<string, number[]>()
  segments.forEach((seg, i) => {
    const k1 = key(seg[0], seg[1])
    const k2 = key(seg[2], seg[3])
    if (!adj.has(k1)) adj.set(k1, [])
    if (!adj.has(k2)) adj.set(k2, [])
    adj.get(k1)!.push(i)
    adj.get(k2)!.push(i)
  })

  const used = new Uint8Array(segments.length)
  const contours: Point[][] = []

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue
    used[start] = 1
    const seg = segments[start]
    const contour: [number, number][] = [
      [seg[0], seg[1]],
      [seg[2], seg[3]]
    ]
    // İleri yönde zincirle
    for (;;) {
      const tail = contour[contour.length - 1]
      const k = key(tail[0], tail[1])
      const candidates = adj.get(k) ?? []
      let extended = false
      for (const si of candidates) {
        if (used[si]) continue
        const s = segments[si]
        used[si] = 1
        if (key(s[0], s[1]) === k) contour.push([s[2], s[3]])
        else contour.push([s[0], s[1]])
        extended = true
        break
      }
      if (!extended) break
    }
    if (contour.length >= 3) {
      // Piksel → mm dönüşümü ve nokta sadeleştirme
      const mm: Point[] = simplify(
        contour.map(([px, py]) => ({ x: px / pxPerMm, y: py / pxPerMm })),
        0.02
      )
      contours.push(mm)
    }
  }

  return contours
}

/** Douglas-Peucker basitleştirme */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points
  const sqTol = tolerance * tolerance

  const sqSegDist = (p: Point, a: Point, b: Point): number => {
    let x = a.x
    let y = a.y
    let dx = b.x - x
    let dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }

  const result: Point[] = [points[0]]
  const stack: [number, number][] = [[0, points.length - 1]]
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (maxDist > sqTol && index > 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  for (let i = 1; i < points.length; i++) {
    if (keep[i]) result.push(points[i])
  }
  return result
}
