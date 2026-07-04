// ─── Şema görüntüsü dışa aktarımı (SVG / PNG) ─────────────────────────────
// Şematik editördeki sembol + tel görünümünü dokümantasyon için beyaz zeminli,
// yazdırılabilir bir SVG'ye ve oradan PNG'ye çevirir.

import type { Footprint, Point, Project } from '../types'
import {
  junctionPoints,
  symbolBBox,
  symbolLayout,
  symbolToWorld
} from '../schematic/model'
import { downloadBlob } from './files'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const C = {
  bg: '#ffffff',
  box: '#15324c',
  pin: '#2b6a93',
  pinName: '#5a6672',
  refDes: '#0a4a86',
  value: '#5a6672',
  wire: '#137a3a',
  netLabel: '#b2560a',
  junction: '#137a3a'
}

const f = (n: number) => n.toFixed(3)

interface Bounds {
  minX: number
  minY: number
  width: number
  height: number
}

/** Tüm sembol ve tellerin kapsadığı sınırlar (+ pay) */
function schematicBounds(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    const bb = symbolBBox(sym, symbolLayout(fp))
    grow(bb.x, bb.y - 5) // refDes yazısına yer
    grow(bb.x + bb.width, bb.y + bb.height + 5) // değer yazısına yer
  }
  for (const w of project.schematic.wires) {
    for (const p of w.points) grow(p.x, p.y)
  }

  if (!isFinite(minX)) {
    // Boş şema
    return { minX: 0, minY: 0, width: 40, height: 30 }
  }
  const margin = 8
  return {
    minX: minX - margin,
    minY: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2
  }
}

/** Şemayı SVG belgesi olarak üret (dünya birimleri; ölçek px için width/height'a uygulanır) */
export function schematicSvg(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  scale = 4
): { svg: string; width: number; height: number } {
  const b = schematicBounds(project, getFootprint)
  const parts: string[] = []
  parts.push(
    `<rect x="${f(b.minX)}" y="${f(b.minY)}" width="${f(b.width)}" height="${f(b.height)}" fill="${C.bg}"/>`
  )

  // Teller
  for (const w of project.schematic.wires) {
    if (w.points.length < 2) continue
    const d = w.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)},${f(p.y)}`)
      .join(' ')
    parts.push(
      `<path d="${d}" fill="none" stroke="${C.wire}" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    if (w.net) {
      const mid1 = w.points[Math.floor(w.points.length / 2) - 1]
      const mid2 = w.points[Math.floor(w.points.length / 2)]
      const mx = (mid1.x + mid2.x) / 2
      const my = (mid1.y + mid2.y) / 2 - 1
      parts.push(
        `<text x="${f(mx)}" y="${f(my)}" font-size="2.4" fill="${C.netLabel}" text-anchor="middle" font-family="system-ui,sans-serif">${esc(w.net)}</text>`
      )
    }
  }

  // Kavşak noktaları
  for (const j of junctionPoints(project.schematic.wires)) {
    parts.push(`<circle cx="${f(j.x)}" cy="${f(j.y)}" r="0.9" fill="${C.junction}"/>`)
  }

  // Semboller
  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    const layout = symbolLayout(fp)
    parts.push(`<g transform="translate(${f(sym.x)},${f(sym.y)}) rotate(${sym.rotation})">`)
    parts.push(
      `<rect x="${f(layout.box.x)}" y="${f(layout.box.y)}" width="${f(layout.box.width)}" height="${f(layout.box.height)}" fill="none" stroke="${C.box}" stroke-width="0.4"/>`
    )
    for (const pin of layout.pins) {
      parts.push(
        `<line x1="${f(pin.end.x)}" y1="${f(pin.end.y)}" x2="${f(pin.inner.x)}" y2="${f(pin.inner.y)}" stroke="${C.pin}" stroke-width="0.35"/>`
      )
      parts.push(`<circle cx="${f(pin.end.x)}" cy="${f(pin.end.y)}" r="0.5" fill="${C.pin}"/>`)
      const nameX = pin.side === 'left' ? pin.inner.x + 1 : pin.inner.x - 1
      const anchor = pin.side === 'left' ? 'start' : 'end'
      parts.push(
        `<text x="${f(nameX)}" y="${f(pin.inner.y + 0.8)}" font-size="2" fill="${C.pinName}" text-anchor="${anchor}" font-family="system-ui,sans-serif">${esc(pin.name)}</text>`
      )
      const net = comp.padNets[pin.name]
      if (net) {
        const netX = pin.side === 'left' ? pin.end.x - 1 : pin.end.x + 1
        const netAnchor = pin.side === 'left' ? 'end' : 'start'
        parts.push(
          `<text x="${f(netX)}" y="${f(pin.end.y - 1)}" font-size="2" fill="${C.netLabel}" text-anchor="${netAnchor}" font-family="system-ui,sans-serif">${esc(net)}</text>`
        )
      }
    }
    parts.push(
      `<text x="${f(layout.box.x)}" y="${f(layout.box.y - 1.5)}" font-size="2.8" font-weight="bold" fill="${C.refDes}" font-family="system-ui,sans-serif">${esc(comp.refDes)}</text>`
    )
    parts.push(
      `<text x="${f(layout.box.x)}" y="${f(layout.box.y + layout.box.height + 3)}" font-size="2.2" fill="${C.value}" font-family="system-ui,sans-serif">${esc(comp.value)}</text>`
    )
    parts.push('</g>')
  }

  const pxW = Math.ceil(b.width * scale)
  const pxH = Math.ceil(b.height * scale)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="${f(b.minX)} ${f(b.minY)} ${f(b.width)} ${f(b.height)}">
<!-- CaYa PCB Studio — şema -->
${parts.join('\n')}
</svg>
`
  return { svg, width: pxW, height: pxH }
}

/** SVG dizesini PNG blob'una çevir (tarayıcı Image + canvas) */
function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Şema SVG içeriği (dosya kaydı için) */
export function schematicSvgContent(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  return schematicSvg(project, getFootprint).svg
}

/** Şema görüntüsünü PNG olarak indir */
export async function exportSchematicPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  scale = 8
): Promise<void> {
  const { svg, width, height } = schematicSvg(project, getFootprint, scale)
  const blob = await svgToPngBlob(svg, width, height)
  if (blob) downloadBlob(`${project.name}-sema.png`, blob)
}

/** Şema görüntüsünü PNG blob olarak döndür (toplu dışa aktarım için) */
export async function schematicPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  scale = 8
): Promise<Blob | null> {
  const { svg, width, height } = schematicSvg(project, getFootprint, scale)
  return svgToPngBlob(svg, width, height)
}
