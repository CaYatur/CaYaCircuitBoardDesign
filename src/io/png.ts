// ─── PNG dışa aktarımı ────────────────────────────────────────────────────
// Yüksek çözünürlüklü kart görseli (dokümantasyon/önizleme) veya tek katman
// siyah-beyaz üretim çıktısı (toner transfer, film).

import type { CopperLayer, Footprint, Project, VisibleLayer } from '../types'
import {
  allDrills,
  copperLayerGeometry,
  silkLayerGeometry,
  type CopperPrimitive,
  type RegionItem
} from './exportGeometry'
import { rasterizeCopper } from './rasterize'
import { downloadBlob } from './files'
import { outlinePoints } from './exportGeometry'
import { cutoutOutlinePoints } from '../core/boardGeometry'
import { analyzeNets } from '../core/netlist'

/** Bir data URL görselini <img> olarak yükler (dışa aktarımda çizmek için) */
function loadImageEl(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawPrimitives(
  ctx: CanvasRenderingContext2D,
  items: CopperPrimitive[],
  color: string
) {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const item of items) {
    if (item.kind === 'stroke') {
      ctx.lineWidth = item.width
      ctx.beginPath()
      ctx.moveTo(item.points[0].x, item.points[0].y)
      for (const p of item.points.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    } else if (item.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(item.x, item.y, Math.max(item.width, item.height) / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // rect ve oval — oval için yuvarlatma
      const r = item.shape === 'oval' ? Math.min(item.width, item.height) / 2 : 0
      const x = item.x - item.width / 2
      const y = item.y - item.height / 2
      ctx.beginPath()
      const rr = Math.min(r, item.width / 2, item.height / 2)
      ctx.moveTo(x + rr, y)
      ctx.arcTo(x + item.width, y, x + item.width, y + item.height, rr)
      ctx.arcTo(x + item.width, y + item.height, x, y + item.height, rr)
      ctx.arcTo(x, y + item.height, x, y, rr)
      ctx.arcTo(x, y, x + item.width, y, rr)
      ctx.closePath()
      ctx.fill()
    }
  }
}

/** Bir zone'un otomatik hesaplanmış dolgu şeklini (dış sınır + delikler) çizer
 *  — evenodd kuralıyla gerçek delikler (foreign-net boşluk + thermal relief) */
function drawRegion(ctx: CanvasRenderingContext2D, z: RegionItem, color: string) {
  ctx.fillStyle = color
  for (const isl of z.islands) {
    if (isl.outer.length < 3) continue
    ctx.beginPath()
    ctx.moveTo(isl.outer[0].x, isl.outer[0].y)
    for (const p of isl.outer.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
    for (const hole of isl.holes) {
      if (hole.length < 3) continue
      ctx.moveTo(hole[0].x, hole[0].y)
      for (const p of hole.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
}

/** Renkli birleşik kart görseli PNG olarak indir */
export async function exportCompositePng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  pxPerMm = 20
): Promise<void> {
  const blob = await compositePngBlob(project, getFootprint, pxPerMm)
  if (blob) downloadBlob(`${project.name}-gorsel.png`, blob)
}

/** Renkli birleşik kart görselini PNG blob olarak döndür */
export async function compositePngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  pxPerMm = 20
): Promise<Blob | null> {
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.scale(pxPerMm, pxPerMm)

  // Kart zemini (lehim maskesi rengi) — iç kesimler (cutout) gerçek delik
  // olarak boşaltılır (evenodd: dış hat + her kesim aynı path'te alt-yol)
  ctx.fillStyle = project.board.color || '#1a5c2a'
  const outline = outlinePoints(project)
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (const p of outline.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  for (const cut of project.board.cutouts ?? []) {
    const cp = cutoutOutlinePoints(cut)
    if (cp.length < 2) continue
    ctx.moveTo(cp[0].x, cp[0].y)
    for (const p of cp.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
  }
  ctx.fill('evenodd')

  const layers: { layer: CopperLayer; color: string; alpha: number }[] = [
    { layer: 'bottom', color: '#3a6fd0', alpha: 0.8 },
    { layer: 'top', color: '#d0402f', alpha: 0.9 }
  ]
  for (const { layer, color, alpha } of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    ctx.globalAlpha = alpha * 0.4
    for (const z of geo.zones) {
      drawRegion(ctx, z, color)
    }
    ctx.globalAlpha = alpha
    drawPrimitives(ctx, geo.copper, color)
  }
  ctx.globalAlpha = 1

  // Silkscreen (üst + alt — tek katmanlı kartta alt yoktur)
  drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, 'top'), '#eeeeee')
  if (project.board.layerCount !== 1) {
    drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, 'bottom'), '#d8c2f0')
  }

  // Yerleştirilen görseller (üst + alt silk)
  for (const im of project.images) {
    if (im.layer !== 'top-silk' && im.layer !== 'bottom-silk') continue
    if (im.layer === 'bottom-silk' && project.board.layerCount === 1) continue
    const el = await loadImageEl(im.src)
    if (!el) continue
    ctx.save()
    ctx.globalAlpha = im.opacity ?? 1
    ctx.translate(im.x + im.width / 2, im.y + im.height / 2)
    if (im.rotation) ctx.rotate((im.rotation * Math.PI) / 180)
    if (im.mirror) ctx.scale(-1, 1)
    ctx.drawImage(el, -im.width / 2, -im.height / 2, im.width, im.height)
    ctx.restore()
  }
  ctx.globalAlpha = 1

  // Delikler
  ctx.fillStyle = '#101318'
  for (const d of allDrills(project, getFootprint)) {
    ctx.beginPath()
    ctx.arc(d.x, d.y, d.diameter / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
}

/** Siyah-beyaz "kart dış hattı + yollar" PNG'sini indir (issue 16) */
export async function exportOutlineTracesPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  pxPerMm = 24
): Promise<void> {
  const blob = await outlineTracesPngBlob(project, getFootprint, pxPerMm)
  if (blob) downloadBlob(`${project.name}-dishat-yollar.png`, blob)
}

/** Siyah-beyaz kart dış hattı + yollar PNG'sini blob olarak döndür */
export async function outlineTracesPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  pxPerMm = 24
): Promise<Blob | null> {
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.scale(pxPerMm, pxPerMm)
  const strokeW = project.board.outlineWidth ?? 0.3

  // Beyaz zemin
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, project.board.width, project.board.height)

  // Tüm bakır (izler + pad'ler) siyah
  const layers: CopperLayer[] = project.board.layerCount === 1 ? ['top'] : ['top', 'bottom']
  for (const layer of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    for (const z of geo.zones) drawRegion(ctx, z, '#000000')
    drawPrimitives(ctx, geo.copper, '#000000')
  }

  // Kart dış hattı — yalnız dış kenar, ayarlanabilir kalınlıkta çizgi
  ctx.strokeStyle = '#000000'
  ctx.lineJoin = 'round'
  ctx.lineWidth = strokeW
  const outline = outlinePoints(project)
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (const p of outline.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  ctx.stroke()
  for (const cut of project.board.cutouts ?? []) {
    const cp = cutoutOutlinePoints(cut)
    if (cp.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(cp[0].x, cp[0].y)
    for (const p of cp.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
    ctx.stroke()
  }

  // Delikler — beyaz oyuk + ince siyah çeper
  for (const dr of allDrills(project, getFootprint)) {
    ctx.beginPath()
    ctx.arc(dr.x, dr.y, dr.diameter / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = strokeW * 0.5
    ctx.stroke()
  }

  return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
}

/** TEK YÜZ üretim yığını PNG'sini indir (üst/alt bakır + alanlar + delikler + kart sınırı + silk + görseller) */
export async function exportSideStackPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  pxPerMm = 24
): Promise<void> {
  const blob = await sideStackPngBlob(project, getFootprint, side, pxPerMm)
  if (blob) downloadBlob(`${project.name}-${side === 'top' ? 'ust' : 'alt'}-yigin.png`, blob)
}

/**
 * TEK YÜZ üretim yığını: belirtilen yüzün bakırı (izler+pad'ler+vialar) + o
 * yüzün bakır alanları (tam opak) + tüm delikler + kart sınırı + o yüzün
 * silkscreen'i (yazılar/refDes/silk pin adları) + o yüze yerleştirilmiş
 * SVG/PNG görseller — tek katmanda siyah-beyaz PNG olarak.
 */
export async function sideStackPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  pxPerMm = 24
): Promise<Blob | null> {
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.scale(pxPerMm, pxPerMm)
  const strokeW = project.board.outlineWidth ?? 0.3

  // Bakır (alanlar + izler/pad/via) — tam opak siyah
  const geo = copperLayerGeometry(project, getFootprint, side)
  for (const z of geo.zones) drawRegion(ctx, z, '#000000')
  drawPrimitives(ctx, geo.copper, '#000000')

  // O yüze yerleştirilmiş görseller
  const silkLayer = side === 'top' ? 'top-silk' : 'bottom-silk'
  for (const im of project.images) {
    if (im.layer !== silkLayer) continue
    const el = await loadImageEl(im.src)
    if (!el) continue
    ctx.save()
    ctx.globalAlpha = im.opacity ?? 1
    ctx.translate(im.x + im.width / 2, im.y + im.height / 2)
    if (im.rotation) ctx.rotate((im.rotation * Math.PI) / 180)
    if (im.mirror) ctx.scale(-1, 1)
    ctx.drawImage(el, -im.width / 2, -im.height / 2, im.width, im.height)
    ctx.restore()
  }
  ctx.globalAlpha = 1

  // Silkscreen (yazılar + refDes + silk pin adları) — siyah
  drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, side), '#000000')

  // Kart dış hattı — yalnız dış kenar
  ctx.strokeStyle = '#000000'
  ctx.lineJoin = 'round'
  ctx.lineWidth = strokeW
  const outline = outlinePoints(project)
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (const p of outline.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  ctx.stroke()
  for (const cut of project.board.cutouts ?? []) {
    const cp = cutoutOutlinePoints(cut)
    if (cp.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(cp[0].x, cp[0].y)
    for (const p of cp.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
    ctx.stroke()
  }

  // Delikler — beyaz oyuk + ince siyah çeper
  for (const dr of allDrills(project, getFootprint)) {
    ctx.beginPath()
    ctx.arc(dr.x, dr.y, dr.diameter / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = strokeW * 0.5
    ctx.stroke()
  }

  return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
}

/** Tek katman silkscreen PNG'sini indir (siyah üstüne beyaz zemin) */
export async function exportSilkLayerPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  opts: { mirror?: boolean; pxPerMm?: number } = {}
): Promise<void> {
  const blob = await silkLayerPngBlob(project, getFootprint, side, opts)
  if (blob) {
    downloadBlob(`${project.name}-${side === 'top' ? 'ust' : 'alt'}-silk.png`, blob)
  }
}

/** Tek katman silkscreen PNG'sini blob olarak döndür */
export async function silkLayerPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer,
  opts: { mirror?: boolean; pxPerMm?: number } = {}
): Promise<Blob | null> {
  const pxPerMm = opts.pxPerMm ?? 24
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.scale(pxPerMm, pxPerMm)
  drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, side), '#000000')

  let out = canvas
  if (opts.mirror) {
    const m = document.createElement('canvas')
    m.width = canvas.width
    m.height = canvas.height
    const mctx = m.getContext('2d')!
    mctx.translate(canvas.width, 0)
    mctx.scale(-1, 1)
    mctx.drawImage(canvas, 0, 0)
    out = m
  }

  return new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
}

/** Tek katman siyah-beyaz üretim PNG'si (toner transfer için aynalanabilir) */
export async function exportLayerPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer,
  opts: { mirror?: boolean; negative?: boolean; pxPerMm?: number } = {}
): Promise<void> {
  const blob = await layerPngBlob(project, getFootprint, layer, opts)
  if (blob) {
    downloadBlob(
      `${project.name}-${layer === 'top' ? 'ust' : 'alt'}${opts.mirror ? '-aynali' : ''}.png`,
      blob
    )
  }
}

/** Tek katman üretim PNG'sini blob olarak döndür */
export async function layerPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer,
  opts: { mirror?: boolean; negative?: boolean; pxPerMm?: number } = {}
): Promise<Blob | null> {
  const pxPerMm = opts.pxPerMm ?? 24 // ~600 dpi
  const { canvas } = rasterizeCopper(project, getFootprint, layer, pxPerMm, 0)
  const ctx = canvas.getContext('2d')!

  // rasterizeCopper: beyaz=bakır siyah=boş → üretim için ters çevir
  // (pozitif çıktı: bakır siyah, zemin beyaz)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const invert = !opts.negative
  if (invert) {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
  }
  ctx.putImageData(img, 0, 0)

  let out = canvas
  if (opts.mirror) {
    const m = document.createElement('canvas')
    m.width = canvas.width
    m.height = canvas.height
    const mctx = m.getContext('2d')!
    mctx.translate(canvas.width, 0)
    mctx.scale(-1, 1)
    mctx.drawImage(canvas, 0, 0)
    out = m
  }

  return new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
}

/**
 * Özel dışa aktarım: kullanıcının seçtiği katmanlar (Katmanlar panelindeki
 * aynı 8 katman) hangi kombinasyonda seçilirse seçilsin TEK bir PNG'de
 * birleştirilir. Varsayılan olarak her katman ayrı renkle çizilir ki üst üste
 * bindiklerinde ayırt edilebilsin; `blackWhite` açıksa tüm renkler zorla
 * siyaha çevrilir (bkz. svg.ts svgCustomExport — aynı renk şeması).
 */
export async function customExportPngBlob(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layers: Record<VisibleLayer, boolean>,
  blackWhite = true,
  pxPerMm = 20
): Promise<Blob | null> {
  const w = Math.ceil(project.board.width * pxPerMm)
  const h = Math.ceil(project.board.height * pxPerMm)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.scale(pxPerMm, pxPerMm)
  const K = '#000000'

  const copperSides: { side: CopperLayer; on: boolean; color: string; zoneColor: string }[] = [
    { side: 'bottom', on: layers.bottom, color: blackWhite ? K : '#9a9a9a', zoneColor: blackWhite ? K : '#4a7fdb' },
    { side: 'top', on: layers.top, color: K, zoneColor: blackWhite ? K : '#d0402f' }
  ]
  for (const { side, on, color, zoneColor } of copperSides) {
    if (!on && !layers.zones) continue
    const geo = copperLayerGeometry(project, getFootprint, side)
    if (layers.zones) {
      ctx.globalAlpha = blackWhite ? 1 : 0.55
      for (const z of geo.zones) drawRegion(ctx, z, zoneColor)
      ctx.globalAlpha = 1
    }
    if (on) drawPrimitives(ctx, geo.copper, color)
  }

  if (layers['top-silk']) drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, 'top'), blackWhite ? K : '#1c4e9c')
  if (layers['bottom-silk']) drawPrimitives(ctx, silkLayerGeometry(project, getFootprint, 'bottom'), blackWhite ? K : '#7a3fa0')

  if (layers.outline) {
    const strokeW = project.board.outlineWidth ?? 0.3
    ctx.strokeStyle = '#000000'
    ctx.lineJoin = 'round'
    ctx.lineWidth = strokeW
    const outline = outlinePoints(project)
    ctx.beginPath()
    ctx.moveTo(outline[0].x, outline[0].y)
    for (const p of outline.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
    ctx.stroke()
    for (const cut of project.board.cutouts ?? []) {
      const cp = cutoutOutlinePoints(cut)
      if (cp.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(cp[0].x, cp[0].y)
      for (const p of cp.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.closePath()
      ctx.stroke()
    }
  }

  if (layers.drill) {
    const strokeW = (project.board.outlineWidth ?? 0.3) * 0.5
    for (const dr of allDrills(project, getFootprint)) {
      ctx.beginPath()
      ctx.arc(dr.x, dr.y, dr.diameter / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = strokeW
      ctx.stroke()
    }
  }

  if (layers.ratsnest) {
    const { airwires } = analyzeNets(project, getFootprint)
    ctx.strokeStyle = blackWhite ? K : '#e8d44d'
    ctx.lineWidth = 0.15
    ctx.setLineDash([0.8, 0.6])
    for (const aw of airwires) {
      ctx.beginPath()
      ctx.moveTo(aw.x1, aw.y1)
      ctx.lineTo(aw.x2, aw.y2)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
}

/** Özel dışa aktarım PNG'sini indir */
export async function exportCustomPng(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layers: Record<VisibleLayer, boolean>,
  blackWhite = true
): Promise<void> {
  const blob = await customExportPngBlob(project, getFootprint, layers, blackWhite)
  if (blob) downloadBlob(`${project.name}-ozel.png`, blob)
}
