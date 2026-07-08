// ─── Silk pin etiketleri ──────────────────────────────────────────────────
// Her pad'in adı/numarası silkscreen katmanında pad'in YANINA (kartın iç
// boşluğuna doğru, pad'e binmeden) yazı olarak çizilir. Bu "silk pin"
// gösterimi hem editörde görünür hem de tüm silk dışa aktarımlarına
// (Gerber/SVG/PNG) dahil edilir; yerleşik ve kullanıcı footprint'lerinin
// hepsinde otomatiktir. Footprint editöründe pad adı etiketi elle taşınmışsa
// (nameDx/nameDy) yazı oraya konur.

import type { Footprint, PadDef } from '../types'
import { textWidth } from '../render/vectorFont'

export interface PinSilkLabel {
  /** Görüntülenecek metin (pin adı/numarası) */
  text: string
  /** Footprint-yerel konum (mm) — yazı çapası */
  x: number
  y: number
  /** Yazı boyutu — büyük harf yüksekliği (mm) */
  size: number
  /** Hizalama: 'left' = çapadan sağa yayılır, 'center' = çapada ortalı */
  align: 'left' | 'center'
}

/** Pad yanı silk yazısının boyutu — okunur, tekdüze, pad'e göre kısıtlı */
export function pinSilkSize(pad: PadDef): number {
  const base = Math.min(pad.width, pad.height)
  return Math.max(0.55, Math.min(0.85, base * 0.75))
}

/**
 * Bir pad için silk pin yazısının footprint-yerel yerleşimi (pad'in İÇİNE değil
 * YANINA, footprint merkezine — yani kartın iç boşluğuna — doğru). nameDx/nameDy
 * tanımlıysa etiket doğrudan oraya konur (footprint editörü kararı üstün).
 *
 * @param cx,cy footprint gövde merkezi (yerel) — iç yön bunun tersinden hesaplanır
 * @param bodyHalfW,bodyHalfH gövdenin yarı genişlik/yükseklik (mm) — sol/sağ
 *   kolon mu yoksa üst/alt sıra mı olduğuna karar verirken dx/dy gövde en-boy
 *   oranına göre normalize edilir. Verilmezse ham dx/dy karşılaştırılır (dar
 *   uzun gövdelerde köşeye yakın pad'leri yanlış sınıflandırabilir).
 */
export function pinLabelPlacement(
  pad: PadDef,
  cx: number,
  cy: number,
  bodyHalfW?: number,
  bodyHalfH?: number
): PinSilkLabel {
  const size = pinSilkSize(pad)
  // Elle konumlandırılmışsa doğrudan kullan
  if (pad.nameDx !== undefined || pad.nameDy !== undefined) {
    return { text: pad.name, x: pad.x + (pad.nameDx ?? 0), y: pad.y + (pad.nameDy ?? 0), size, align: 'center' }
  }
  const margin = 0.35
  const halfW = pad.width / 2
  const halfH = pad.height / 2
  const dx = pad.x - cx
  const dy = pad.y - cy
  const nx = bodyHalfW ? dx / bodyHalfW : dx
  const ny = bodyHalfH ? dy / bodyHalfH : dy
  // Baskın eksene göre yan seç (gövde en-boy oranına göre normalize edilmiş):
  // sol/sağ kolon → yatay yan; üst/alt sıra → dikey yan
  if (Math.abs(nx) >= Math.abs(ny)) {
    if (dx <= 0) {
      // Sol kolon → etiket pad'in SAĞINA (içe doğru), sola hizalı
      return { text: pad.name, x: pad.x + halfW + margin, y: pad.y, size, align: 'left' }
    }
    // Sağ kolon → etiket pad'in SOLUNA (içe doğru); çapayı genişlik kadar geri al
    const w = textWidth(pad.name, size)
    return { text: pad.name, x: pad.x - halfW - margin - w, y: pad.y, size, align: 'left' }
  }
  if (dy <= 0) {
    // Üst sıra → etiket pad'in ALTINA (içe doğru), ortalı
    return { text: pad.name, x: pad.x, y: pad.y + halfH + margin + size / 2, size, align: 'center' }
  }
  // Alt sıra → etiket pad'in ÜSTÜNE (içe doğru), ortalı
  return { text: pad.name, x: pad.x, y: pad.y - halfH - margin - size / 2, size, align: 'center' }
}

type Side = 'left' | 'right' | 'top' | 'bottom'

/**
 * Pad'in sütun mu (sol/sağ) yoksa sıra mı (üst/alt) parçası olduğuna karar
 * verir. Öncelik YAPISAL: pad'in x'ini paylaşan kaç pad varsa (sütun boyu) ile
 * y'sini paylaşan kaç pad varsa (sıra boyu) karşılaştırılır — hangisi daha
 * kalabalıksa pad o grubun (gerçek sütun/sıra) üyesidir. Böylece bir sütunun
 * uç pad'i (örn. ilk/son pin, kenara yakın), köşeye yakın olduğu için yanlışlıkla
 * ayrı bir "sıra" sanılmaz. Sütun/sıra boyları eşitse (çoğu pad'de tek başına
 * kalan küçük footprint'ler) gövde en-boy oranına göre normalize edilmiş dx/dy
 * karşılaştırması devreye girer.
 */
function padSide(
  pad: PadDef,
  cx: number,
  cy: number,
  bodyHalfW: number,
  bodyHalfH: number,
  columnSize: number,
  rowSize: number
): Side {
  const dx = pad.x - cx
  const dy = pad.y - cy
  if (columnSize !== rowSize) {
    if (columnSize > rowSize) return dx <= 0 ? 'left' : 'right'
    return dy <= 0 ? 'top' : 'bottom'
  }
  const nx = bodyHalfW ? dx / bodyHalfW : dx
  const ny = bodyHalfH ? dy / bodyHalfH : dy
  if (Math.abs(nx) >= Math.abs(ny)) return dx <= 0 ? 'left' : 'right'
  return dy <= 0 ? 'top' : 'bottom'
}

const SIDE_MARGIN = 0.3
const MIN_SILK_SIZE = 0.35
const LABEL_GAP = 0.15

interface Rect { x: number; y: number; w: number; h: number }

function rectsOverlap(a: Rect, b: Rect, gap = LABEL_GAP): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2
}

/** Bir etiketin (o an ki x/y/size/align'ına göre) kapladığı dikdörtgen */
function labelRect(l: { x: number; y: number; size: number; align: 'left' | 'center'; text: string }): Rect {
  const w = textWidth(l.text, l.size)
  const h = l.size * 1.2
  return { x: l.align === 'left' ? l.x + w / 2 : l.x, y: l.y, w, h }
}

/** Pad'leri neredeyse aynı x (sütun) veya y (sıra) değerine göre alt-gruplara ayırır */
function clusterByCoord(pads: PadDef[], axis: 'x' | 'y'): PadDef[][] {
  const sorted = [...pads].sort((a, b) => a[axis] - b[axis])
  const clusters: PadDef[][] = []
  for (const p of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(p[axis] - last[0][axis]) < 0.15) last.push(p)
    else clusters.push([p])
  }
  return clusters
}

interface Draft {
  text: string
  x: number
  y: number
  size: number
  align: 'left' | 'center'
  /** İtme yönü birimi — çakışma çözümünde etiket bu yönde geriye/ileriye kaydırılır */
  dx: number
  dy: number
}

/**
 * Sol/sağ tarafta bir veya birden çok pad sütunu (çift sıra header gibi) için
 * hizalı taslak yerleşim üretir. Merkeze en yakın (en içteki) sütun içe doğru,
 * diğer tüm sütunlar dışa doğru (dıştan içe üst üste yığılarak) yerleştirilir —
 * böylece sütunlar arasındaki pad'lerin üstüne binmez.
 */
function draftColumns(group: PadDef[], side: 'left' | 'right'): Draft[] {
  if (!group.length) return []
  const clusters = clusterByCoord(group, 'x').sort((a, b) => (side === 'left' ? a[0].x - b[0].x : b[0].x - a[0].x))
  const inner = clusters[clusters.length - 1]
  const outers = clusters.slice(0, -1) // dıştan içe sıralı (en dıştaki ilk)
  const out: Draft[] = []

  // İçteki sütun: merkeze doğru (mevcut/klasik davranış)
  {
    const sorted = [...inner].sort((a, b) => a.y - b.y)
    let size = Math.min(...sorted.map(pinSilkSize))
    for (let i = 1; i < sorted.length; i++) {
      const pitch = sorted[i].y - sorted[i - 1].y
      if (pitch > 0) size = Math.min(size, pitch / 1.3)
    }
    size = Math.max(MIN_SILK_SIZE, size)
    const edge = side === 'left'
      ? Math.max(...sorted.map((p) => p.x + p.width / 2))
      : Math.min(...sorted.map((p) => p.x - p.width / 2))
    for (const pad of sorted) {
      if (side === 'left') out.push({ text: pad.name, x: edge + SIDE_MARGIN, y: pad.y, size, align: 'left', dx: 1, dy: 0 })
      else {
        const w = textWidth(pad.name, size)
        out.push({ text: pad.name, x: edge - SIDE_MARGIN - w, y: pad.y, size, align: 'left', dx: -1, dy: 0 })
      }
    }
  }

  // Dıştaki sütun(lar): merkezden uzağa doğru, her biri bir öncekinin ötesinden başlar
  let pushedEdge: number | null = null
  for (const cluster of outers) {
    const sorted = [...cluster].sort((a, b) => a.y - b.y)
    let size = Math.min(...sorted.map(pinSilkSize))
    for (let i = 1; i < sorted.length; i++) {
      const pitch = sorted[i].y - sorted[i - 1].y
      if (pitch > 0) size = Math.min(size, pitch / 1.3)
    }
    size = Math.max(MIN_SILK_SIZE, size)
    let edge = side === 'left'
      ? Math.min(...sorted.map((p) => p.x - p.width / 2))
      : Math.max(...sorted.map((p) => p.x + p.width / 2))
    if (pushedEdge !== null) edge = side === 'left' ? Math.min(edge, pushedEdge) : Math.max(edge, pushedEdge)
    const maxW = Math.max(...sorted.map((p) => textWidth(p.name, size)))
    for (const pad of sorted) {
      if (side === 'left') {
        const w = textWidth(pad.name, size)
        out.push({ text: pad.name, x: edge - SIDE_MARGIN - w, y: pad.y, size, align: 'left', dx: -1, dy: 0 })
      } else {
        out.push({ text: pad.name, x: edge + SIDE_MARGIN, y: pad.y, size, align: 'left', dx: 1, dy: 0 })
      }
    }
    pushedEdge = side === 'left' ? edge - SIDE_MARGIN - maxW - SIDE_MARGIN : edge + SIDE_MARGIN + maxW + SIDE_MARGIN
  }
  return out
}

/**
 * Üst/alt tarafta bir veya birden çok pad sırası için hizalı taslak yerleşim.
 * draftColumns ile aynı dıştan-içe mantığı, eksen döndürülmüş halde.
 */
function draftRows(group: PadDef[], side: 'top' | 'bottom'): Draft[] {
  if (!group.length) return []
  const clusters = clusterByCoord(group, 'y').sort((a, b) => (side === 'top' ? a[0].y - b[0].y : b[0].y - a[0].y))
  const inner = clusters[clusters.length - 1]
  const outers = clusters.slice(0, -1)
  const out: Draft[] = []

  const fitSize = (sorted: PadDef[]): number => {
    let size = Math.min(...sorted.map(pinSilkSize))
    for (let iter = 0; iter < 8 && size > MIN_SILK_SIZE; iter++) {
      let fits = true
      for (let i = 1; i < sorted.length; i++) {
        const pitch = sorted[i].x - sorted[i - 1].x
        const halfA = textWidth(sorted[i - 1].name, size) / 2
        const halfB = textWidth(sorted[i].name, size) / 2
        if (halfA + halfB + 0.2 > pitch) { fits = false; break }
      }
      if (fits) break
      size *= 0.88
    }
    return Math.max(MIN_SILK_SIZE, size)
  }

  {
    const sorted = [...inner].sort((a, b) => a.x - b.x)
    const size = fitSize(sorted)
    const edge = side === 'top'
      ? Math.min(...sorted.map((p) => p.y - p.height / 2))
      : Math.max(...sorted.map((p) => p.y + p.height / 2))
    for (const pad of sorted) {
      const y = side === 'top' ? edge - SIDE_MARGIN - size / 2 : edge + SIDE_MARGIN + size / 2
      out.push({ text: pad.name, x: pad.x, y, size, align: 'center', dx: 0, dy: side === 'top' ? 1 : -1 })
    }
  }

  let pushedEdge: number | null = null
  for (const cluster of outers) {
    const sorted = [...cluster].sort((a, b) => a.x - b.x)
    const size = fitSize(sorted)
    let edge = side === 'top'
      ? Math.max(...sorted.map((p) => p.y + p.height / 2))
      : Math.min(...sorted.map((p) => p.y - p.height / 2))
    if (pushedEdge !== null) edge = side === 'top' ? Math.max(edge, pushedEdge) : Math.min(edge, pushedEdge)
    for (const pad of sorted) {
      const y = side === 'top' ? edge + SIDE_MARGIN + size / 2 : edge - SIDE_MARGIN - size / 2
      out.push({ text: pad.name, x: pad.x, y, size, align: 'center', dx: 0, dy: side === 'top' ? -1 : 1 })
    }
    pushedEdge = side === 'top' ? edge + SIDE_MARGIN + size + SIDE_MARGIN : edge - SIDE_MARGIN - size - SIDE_MARGIN
  }
  return out
}

/**
 * Son güvenlik geçişi: hiçbir etiket herhangi bir pad'in veya daha önce
 * yerleştirilmiş başka bir etiketin üstüne binmesin. Çakışma varsa etiket
 * kendi itme yönünde küçük adımlarla ileri kaydırılır; yeterli değilse
 * yazı boyutu küçültülür. (Elle konumlandırılmış etiketler hareket ettirilmez.)
 */
function resolveCollisions(drafts: Draft[], fixedRects: Rect[]): PinSilkLabel[] {
  const STEP = 0.1
  const MAX_STEPS = 80
  const placed: Rect[] = [...fixedRects]
  const out: PinSilkLabel[] = []
  for (const d of drafts) {
    let steps = 0
    while (steps < MAX_STEPS) {
      const rect = labelRect(d)
      const blocked = placed.some((r) => rectsOverlap(rect, r)) || fixedRects.some((r) => rectsOverlap(rect, r))
      if (!blocked) break
      d.x += d.dx * STEP
      d.y += d.dy * STEP
      steps++
    }
    if (steps >= MAX_STEPS) d.size = Math.max(MIN_SILK_SIZE * 0.6, d.size * 0.65)
    placed.push(labelRect(d))
    out.push({ text: d.text, x: d.x, y: d.y, size: d.size, align: d.align })
  }
  return out
}

/**
 * Footprint'in tüm pinleri için silk yazı yerleşimleri (footprint-yerel).
 * Montaj deliği (MH*) ve adsız pad'ler atlanır. Elle konumlandırılmış
 * (nameDx/nameDy) pad'ler tek tek, oldukları yerde sabit kalır; geri kalanlar
 * yanındaki kenara göre sütun/sıra (çift sıra header'lar dahil) olarak
 * gruplanıp hizalı dizilir, ardından hiçbir pad veya etiketle çakışmayana
 * kadar kendi yönünde kaydırılarak/gerekirse küçültülerek kesinleştirilir.
 */
export function pinSilkLabels(fp: Footprint): PinSilkLabel[] {
  const cx = fp.body.x + fp.body.width / 2
  const cy = fp.body.y + fp.body.height / 2
  const halfW = fp.body.width / 2
  const halfH = fp.body.height / 2
  const pads = fp.pads.filter((p) => p.name && !p.name.startsWith('MH'))
  const manual = pads.filter((p) => p.nameDx !== undefined || p.nameDy !== undefined)
  const auto = pads.filter((p) => p.nameDx === undefined && p.nameDy === undefined)

  const manualLabels = manual.map((p) => pinLabelPlacement(p, cx, cy, halfW, halfH))
  const padRects: Rect[] = pads.map((p) => ({ x: p.x, y: p.y, w: p.width, h: p.height }))
  const fixedRects: Rect[] = [...padRects, ...manualLabels.map(labelRect)]

  const columnSize = new Map<PadDef, number>()
  for (const cluster of clusterByCoord(auto, 'x')) for (const p of cluster) columnSize.set(p, cluster.length)
  const rowSize = new Map<PadDef, number>()
  for (const cluster of clusterByCoord(auto, 'y')) for (const p of cluster) rowSize.set(p, cluster.length)

  const groups: Record<Side, PadDef[]> = { left: [], right: [], top: [], bottom: [] }
  for (const p of auto) {
    groups[padSide(p, cx, cy, halfW, halfH, columnSize.get(p)!, rowSize.get(p)!)].push(p)
  }

  const drafts: Draft[] = [
    ...draftColumns(groups.left, 'left'),
    ...draftColumns(groups.right, 'right'),
    ...draftRows(groups.top, 'top'),
    ...draftRows(groups.bottom, 'bottom')
  ]

  return [...manualLabels, ...resolveCollisions(drafts, fixedRects)]
}
