// ─── Bakır alan (zone) otomatik dolgu motoru ──────────────────────────────
// Zone sınırı serbest bir çokgendir; gerçek dolgu şekli bu sınırdan otomatik
// üretilir: sınır bitmap'e çizilip (io/rasterize.ts'teki G-code izolasyon
// tekniğiyle aynı yöntem) marching squares ile kontur çıkarılır. Farklı
// netteki (veya atanmamış) pad/via/iz'lerin çevresi `clearance` kadar
// boşaltılır; aynı netteki THT pad/via'lara varsayılan olarak ısı yalıtım
// (thermal relief) köprüleri eklenir. Tek bir hesaplama; editör önizlemesi,
// PNG/SVG/Gerber dışa aktarımlarının hepsi aynı sonucu kullanır.

import type { CopperZone, Point } from '../types'
import type { CopperPrimitive } from '../io/exportGeometry'
import { extractContours } from '../io/rasterize'
import { pointInPolygon } from './geometry'

const PX_PER_MM = 20

/** Bir dış sınır ve içindeki delikler (foreign-net boşluk + thermal relief) */
export interface ZoneFillIsland {
  outer: Point[]
  holes: Point[][]
}

export interface ZoneFillResult {
  islands: ZoneFillIsland[]
}

function polygonArea(pts: Point[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function drawItem(ctx: CanvasRenderingContext2D, item: CopperPrimitive, color: string, inflate: number): void {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (item.kind === 'stroke') {
    if (item.points.length < 2) return
    ctx.lineWidth = item.width + 2 * inflate
    ctx.beginPath()
    ctx.moveTo(item.points[0].x, item.points[0].y)
    for (const p of item.points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  } else {
    const w = item.width + 2 * inflate
    const h = item.height + 2 * inflate
    ctx.beginPath()
    if (item.shape === 'circle') {
      ctx.arc(item.x, item.y, Math.max(w, h) / 2, 0, Math.PI * 2)
    } else {
      ctx.rect(item.x - w / 2, item.y - h / 2, w, h)
    }
    ctx.fill()
  }
}

/** Bir THT pad/via'nın etrafına ısı yalıtım (thermal relief) deseni çizer:
 *  ince bir boşluk halkası + 4 köşegen köprü (spoke) ile dolguya bağlanır. */
function drawThermalRelief(ctx: CanvasRenderingContext2D, x: number, y: number, padR: number): void {
  const ringOuter = padR + Math.max(0.5, padR * 0.6)
  const spokeW = Math.max(0.3, padR * 0.7)
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(x, y, ringOuter, 0, Math.PI * 2)
  ctx.moveTo(x + padR, y)
  ctx.arc(x, y, padR, 0, Math.PI * 2, true)
  ctx.fill('evenodd')
  ctx.fillStyle = '#fff'
  for (let k = 0; k < 4; k++) {
    const ang = (Math.PI / 2) * k + Math.PI / 4
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    ctx.fillRect(0, -spokeW / 2, ringOuter + 0.05, spokeW)
    ctx.restore()
  }
}

/**
 * Bir bakır alanın (zone) gerçek dolgu şeklini hesaplar.
 * @param layerCopper Zone ile AYNI katmandaki diğer bakır ilkelleri (pad/via/iz) —
 *   zone bunlara göre otomatik olarak kesilir/dolgu şekli alır.
 */
export function computeZoneFill(zone: CopperZone, layerCopper: CopperPrimitive[]): ZoneFillResult {
  if (zone.points.length < 3) return { islands: [] }

  const xs = zone.points.map((p) => p.x)
  const ys = zone.points.map((p) => p.y)
  const margin = Math.max(zone.clearance, 0.5) + 1
  const ox = Math.min(...xs) - margin
  const oy = Math.min(...ys) - margin
  const bw = Math.max(...xs) - Math.min(...xs) + margin * 2
  const bh = Math.max(...ys) - Math.min(...ys) + margin * 2
  const w = Math.max(1, Math.ceil(bw * PX_PER_MM))
  const h = Math.max(1, Math.ceil(bh * PX_PER_MM))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.scale(PX_PER_MM, PX_PER_MM)
  ctx.translate(-ox, -oy)

  // 1) Zone sınırı — beyaz dolgu
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(zone.points[0].x, zone.points[0].y)
  for (const p of zone.points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  ctx.fill()

  // 2) Farklı net (veya atanmamış) öğelerin çevresi boşaltılır
  for (const item of layerCopper) {
    if (zone.net !== '' && item.net === zone.net) continue
    drawItem(ctx, item, '#000', zone.clearance)
  }

  // 3) Aynı netteki THT pad/via'lara ısı yalıtım köprüsü (varsayılan açık)
  if (zone.thermalRelief !== false) {
    for (const item of layerCopper) {
      if (item.kind !== 'flash' || !item.tht) continue
      if (zone.net === '' || item.net !== zone.net) continue
      drawThermalRelief(ctx, item.x, item.y, Math.max(item.width, item.height) / 2)
    }
  }

  const rawContours = extractContours(canvas, PX_PER_MM)
  const contours = rawContours.map((c) => c.map((p) => ({ x: p.x + ox, y: p.y + oy })))

  // Kontur içerme sayımı ile dış sınır / delik ayrımı (iç içe delik/ada destekli):
  // bir kontur çift sayıda başka konturun içindeyse dış sınır, tekse deliktir.
  const containCount = contours.map((c, i) => {
    let n = 0
    for (let j = 0; j < contours.length; j++) {
      if (i !== j && c[0] && pointInPolygon(c[0], contours[j])) n++
    }
    return n
  })
  const islands: ZoneFillIsland[] = []
  contours.forEach((c, i) => {
    if (c.length >= 3 && containCount[i] % 2 === 0) islands.push({ outer: c, holes: [] })
  })
  contours.forEach((c, i) => {
    if (c.length < 3 || containCount[i] % 2 === 0) return
    let bestIdx = -1
    let bestArea = Infinity
    islands.forEach((isl, k) => {
      if (c[0] && pointInPolygon(c[0], isl.outer)) {
        const a = polygonArea(isl.outer)
        if (a < bestArea) { bestArea = a; bestIdx = k }
      }
    })
    if (bestIdx >= 0) islands[bestIdx].holes.push(c)
  })

  return { islands }
}
