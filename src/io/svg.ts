// ─── SVG dışa aktarımı ────────────────────────────────────────────────────
// Lazer kesim, toner transfer ve dokümantasyon için katman bazlı SVG.
// Boyutlar gerçek mm cinsindendir (width/height mm birimli).

import type { CopperLayer, Footprint, Project } from '../types'
import {
  copperLayerGeometry,
  layerPads,
  outlinePoints,
  silkLayerGeometry,
  allDrills,
  type CopperPrimitive,
  type PadFlash
} from './exportGeometry'
import { cutoutOutlinePoints } from '../core/boardGeometry'

/** Bir kesim şeklinin SVG path 'd' verisi */
function cutoutPathD(cut: Parameters<typeof cutoutOutlinePoints>[0]): string {
  const pts = cutoutOutlinePoints(cut)
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') + ' Z'
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function primitiveSvg(item: CopperPrimitive, color: string, inflate = 0): string {
  if (item.kind === 'stroke') {
    const d = item.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`)
      .join(' ')
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${(item.width + 2 * inflate).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const w = item.width + 2 * inflate
  const h = item.height + 2 * inflate
  if (item.shape === 'circle') {
    return `<circle cx="${item.x.toFixed(4)}" cy="${item.y.toFixed(4)}" r="${(Math.max(w, h) / 2).toFixed(4)}" fill="${color}"/>`
  }
  const rx = item.shape === 'oval' ? Math.min(w, h) / 2 : 0
  return `<rect x="${(item.x - w / 2).toFixed(4)}" y="${(item.y - h / 2).toFixed(4)}" width="${w.toFixed(4)}" height="${h.toFixed(4)}" rx="${rx.toFixed(4)}" fill="${color}"/>`
}

/** Tek bir pad'i (opsiyonel genişleme ile) SVG şekli olarak */
function padSvg(p: PadFlash, color: string, inflate = 0): string {
  const w = p.width + 2 * inflate
  const h = p.height + 2 * inflate
  if (p.shape === 'circle') {
    return `<circle cx="${p.x.toFixed(4)}" cy="${p.y.toFixed(4)}" r="${(Math.max(w, h) / 2).toFixed(4)}" fill="${color}"/>`
  }
  const rx = p.shape === 'oval' ? Math.min(w, h) / 2 : 0
  return `<rect x="${(p.x - w / 2).toFixed(4)}" y="${(p.y - h / 2).toFixed(4)}" width="${w.toFixed(4)}" height="${h.toFixed(4)}" rx="${rx.toFixed(4)}" fill="${color}"/>`
}

export interface SvgOptions {
  /** Alt katman için genellikle true (toner transfer/lazer aynalı ister) */
  mirror?: boolean
  /** Negatif çıktı: bakır beyaz, zemin siyah (film pozlama için) */
  negative?: boolean
  /** Delikleri işaretle */
  showDrills?: boolean
}

/** Tek bakır katmanı — siyah/beyaz üretim çıktısı */
export function svgCopperLayer(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer,
  opts: SvgOptions = {}
): string {
  const w = project.board.width
  const h = project.board.height
  const fg = opts.negative ? '#ffffff' : '#000000'
  const bg = opts.negative ? '#000000' : '#ffffff'
  const geo = copperLayerGeometry(project, getFootprint, layer)

  const parts: string[] = []
  // Zemin
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`)

  // 1) Bakır alanlar
  for (const z of geo.zones) {
    parts.push(
      `<rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="${fg}"/>`
    )
  }
  // 2) Zone varsa farklı netlerin çevresini zemin rengiyle boşalt
  if (geo.zones.length > 0) {
    const clearance = Math.max(...geo.zones.map((z) => z.clearance))
    for (const item of geo.copper) {
      const sameNet = geo.zones.every((z) => z.net !== '' && item.net === z.net)
      if (!sameNet) parts.push(primitiveSvg(item, bg, clearance))
    }
  }
  // 3) Tüm bakır
  for (const item of geo.copper) {
    parts.push(primitiveSvg(item, fg))
  }
  // 4) Delikler (opsiyonel işaret)
  if (opts.showDrills) {
    for (const d of allDrills(project, getFootprint)) {
      parts.push(
        `<circle cx="${d.x}" cy="${d.y}" r="${(d.diameter / 2).toFixed(4)}" fill="${bg}"/>`
      )
    }
  }

  const transform = opts.mirror ? ` transform="translate(${w},0) scale(-1,1)"` : ''
  return svgDoc(w, h, `<g${transform}>${parts.join('\n')}</g>`)
}

/** Silkscreen katmanı SVG */
export function svgSilkLayer(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  opts: SvgOptions = {}
): string {
  const w = project.board.width
  const h = project.board.height
  const parts: string[] = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
  ]
  for (const s of silkLayerGeometry(project, getFootprint, side)) {
    parts.push(primitiveSvg(s, '#000000'))
  }
  const transform = opts.mirror ? ` transform="translate(${w},0) scale(-1,1)"` : ''
  return svgDoc(w, h, `<g${transform}>${parts.join('\n')}</g>`)
}

/**
 * Lehim pastası / stencil katmanı SVG — yalnız SMD pad'ler siyah dolu.
 * Lazer/vinil stencil kesimi için gerçek ölçülü (mm) çıktı.
 */
export function svgSolderPaste(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  opts: SvgOptions = {}
): string {
  const w = project.board.width
  const h = project.board.height
  const parts: string[] = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`]
  for (const p of layerPads(project, getFootprint, side)) {
    if (p.smd) parts.push(padSvg(p, '#000000'))
  }
  const transform = opts.mirror ? ` transform="translate(${w},0) scale(-1,1)"` : ''
  return svgDoc(w, h, `<g${transform}>${parts.join('\n')}</g>`)
}

/**
 * Lehim maskesi katmanı SVG — pad'lerin açık kalacağı bölgeler (siyah = maske
 * açığı). ~0.05 mm maske genişlemesiyle. Delikli pad'ler her iki yüzde açılır.
 */
export function svgSolderMask(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  opts: SvgOptions = {}
): string {
  const w = project.board.width
  const h = project.board.height
  const parts: string[] = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`]
  for (const p of layerPads(project, getFootprint, side)) {
    parts.push(padSvg(p, '#000000', 0.05))
  }
  const transform = opts.mirror ? ` transform="translate(${w},0) scale(-1,1)"` : ''
  return svgDoc(w, h, `<g${transform}>${parts.join('\n')}</g>`)
}

/**
 * Montaj (assembly) çizimi SVG — elle veya makineyle dizgi için dokümantasyon:
 * kart dış hattı + pad konumları (açık gri) + silkscreen (gövde çizimleri,
 * refDes ve silk pin adları koyu). Belirtilen yüz için (üst/alt) üstten görünüm.
 */
export function svgAssembly(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer
): string {
  const w = project.board.width
  const h = project.board.height
  const strokeW = project.board.outlineWidth ?? 0.3
  const parts: string[] = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`]

  // Kart dış hattı (açık gri) + iç kesimler
  const pts = outlinePoints(project)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') + ' Z'
  parts.push(`<path d="${d}" fill="none" stroke="#b0b4bb" stroke-width="${strokeW.toFixed(4)}" stroke-linejoin="round"/>`)
  for (const cut of project.board.cutouts ?? []) {
    parts.push(`<path d="${cutoutPathD(cut)}" fill="none" stroke="#b0b4bb" stroke-width="${strokeW.toFixed(4)}"/>`)
  }

  // Pad konumları — açık gri dolgu (yerleşim rehberi)
  for (const p of layerPads(project, getFootprint, side)) {
    parts.push(padSvg(p, '#d0d4da'))
  }

  // Silkscreen: gövde çizimleri + refDes + silk pin adları (koyu)
  for (const s of silkLayerGeometry(project, getFootprint, side)) {
    parts.push(primitiveSvg(s, '#14171c'))
  }

  return svgDoc(w, h, parts.join('\n'))
}

/** Kart dış hattı — lazer kesim için (kırmızı = kesim çizgisi standardı) */
export function svgOutline(project: Project, getFootprint: (id: string) => Footprint | undefined): string {
  const w = project.board.width
  const h = project.board.height
  const pts = outlinePoints(project)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ')
  const parts = [
    `<path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`
  ]
  // İç kesimler (yuva/pencere) de kesim çizgisi olarak
  for (const cut of project.board.cutouts ?? []) {
    parts.push(`<path d="${cutoutPathD(cut)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`)
  }
  // Montaj/tüm delikler de kesim çizgisi olarak
  for (const drill of allDrills(project, getFootprint)) {
    parts.push(
      `<circle cx="${drill.x}" cy="${drill.y}" r="${(drill.diameter / 2).toFixed(4)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`
    )
  }
  return svgDoc(w, h, parts.join('\n'))
}

/** Renkli birleşik görünüm (dokümantasyon) */
export function svgComposite(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const w = project.board.width
  const h = project.board.height
  const outline = outlinePoints(project)
  const outlineD = outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ')
  const parts: string[] = [
    `<path d="${outlineD}" fill="${project.board.color || '#1e5128'}"/>`
  ]
  const layers: { layer: CopperLayer; color: string; op: number }[] = [
    { layer: 'bottom', color: '#4a7fdb', op: 0.85 },
    { layer: 'top', color: '#d94f3d', op: 0.9 }
  ]
  for (const { layer, color, op } of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    parts.push(`<g opacity="${op}">`)
    for (const z of geo.zones) {
      parts.push(`<rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="${color}" opacity="0.4"/>`)
    }
    for (const item of geo.copper) parts.push(primitiveSvg(item, color))
    parts.push('</g>')
  }
  for (const s of silkLayerGeometry(project, getFootprint, 'top')) {
    parts.push(primitiveSvg(s, '#e8e8e8'))
  }
  for (const d of allDrills(project, getFootprint)) {
    parts.push(`<circle cx="${d.x}" cy="${d.y}" r="${(d.diameter / 2).toFixed(4)}" fill="#14171c"/>`)
  }
  return svgDoc(w, h, parts.join('\n'))
}

/**
 * Siyah-beyaz "kart dış hattı + yollar" çıktısı (issue 16). Kartın yalnız dış
 * kenarı (ve iç kesimleri) ayarlanabilir kalınlıkta çizgi olarak; tüm bakır
 * (izler + pad'ler) siyah dolu; delikler beyaz olarak içine oyulmuş şekilde.
 */
export function svgOutlineTraces(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const w = project.board.width
  const h = project.board.height
  const strokeW = project.board.outlineWidth ?? 0.3
  const parts: string[] = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
  ]

  // Tüm bakır (izler + pad'ler) siyah dolu — her iki katman birlikte
  const layers: CopperLayer[] = project.board.layerCount === 1 ? ['top'] : ['top', 'bottom']
  for (const layer of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    for (const z of geo.zones) {
      parts.push(`<rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="#000000"/>`)
    }
    for (const item of geo.copper) parts.push(primitiveSvg(item, '#000000'))
  }

  // Kart dış hattı — yalnız dış kenar, ayarlanabilir kalınlıkta çizgi
  const pts = outlinePoints(project)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') + ' Z'
  parts.push(`<path d="${d}" fill="none" stroke="#000000" stroke-width="${strokeW.toFixed(4)}" stroke-linejoin="round"/>`)
  for (const cut of project.board.cutouts ?? []) {
    parts.push(`<path d="${cutoutPathD(cut)}" fill="none" stroke="#000000" stroke-width="${strokeW.toFixed(4)}"/>`)
  }

  // Delikler — beyaz oyuk (pad ortasında delik görünür), ince siyah çeper
  for (const dr of allDrills(project, getFootprint)) {
    parts.push(
      `<circle cx="${dr.x}" cy="${dr.y}" r="${(dr.diameter / 2).toFixed(4)}" fill="#ffffff" stroke="#000000" stroke-width="${(strokeW * 0.5).toFixed(4)}"/>`
    )
  }

  return svgDoc(w, h, parts.join('\n'))
}

/**
 * TAM KART dışa aktarımı: kart dış çerçevesi + iç kesimler + her iki bakır
 * katman (izler + pad'ler + vialar + alanlar) + delikler + silkscreen yazılar
 * (refDes, silk çizimleri ve serbest yazılar vektör çizgi olarak) tek SVG'de.
 * Dokümantasyon/arşiv için eksiksiz, ölçüleri mm cinsinden çıktı.
 */
export function svgFullBoard(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const w = project.board.width
  const h = project.board.height
  const strokeW = project.board.outlineWidth ?? 0.3
  const parts: string[] = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`
  ]

  // Bakır: alt katman gri, üst katman siyah (tek katmanlıysa yalnız üst)
  const layers: { layer: CopperLayer; color: string }[] =
    project.board.layerCount === 1
      ? [{ layer: 'top', color: '#000000' }]
      : [
          { layer: 'bottom', color: '#9a9a9a' },
          { layer: 'top', color: '#000000' }
        ]
  for (const { layer, color } of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    parts.push(`<g>`)
    for (const z of geo.zones) {
      parts.push(
        `<rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="${color}" opacity="0.35"/>`
      )
    }
    for (const item of geo.copper) parts.push(primitiveSvg(item, color))
    parts.push('</g>')
  }

  // Silkscreen (yazılar dahil): üst koyu mavi, alt mor — bakırdan ayırt edilir
  for (const s of silkLayerGeometry(project, getFootprint, 'top')) {
    parts.push(primitiveSvg(s, '#1c4e9c'))
  }
  for (const s of silkLayerGeometry(project, getFootprint, 'bottom')) {
    parts.push(primitiveSvg(s, '#7a3fa0'))
  }

  // Kart dış çerçevesi + iç kesimler (kesim çizgisi)
  const pts = outlinePoints(project)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ') + ' Z'
  parts.push(`<path d="${d}" fill="none" stroke="#000000" stroke-width="${strokeW.toFixed(4)}" stroke-linejoin="round"/>`)
  for (const cut of project.board.cutouts ?? []) {
    parts.push(`<path d="${cutoutPathD(cut)}" fill="none" stroke="#000000" stroke-width="${strokeW.toFixed(4)}"/>`)
  }

  // Delikler: beyaz oyuk + ince siyah çeper (montaj delikleri dahil)
  for (const dr of allDrills(project, getFootprint)) {
    parts.push(
      `<circle cx="${dr.x}" cy="${dr.y}" r="${(dr.diameter / 2).toFixed(4)}" fill="#ffffff" stroke="#000000" stroke-width="${(strokeW * 0.5).toFixed(4)}"/>`
    )
  }

  return svgDoc(w, h, parts.join('\n'))
}

function svgDoc(w: number, h: number, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<!-- CaYa PCB Studio -->
${body}
</svg>
`
}
