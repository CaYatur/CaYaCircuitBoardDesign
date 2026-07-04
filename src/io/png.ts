// ─── PNG dışa aktarımı ────────────────────────────────────────────────────
// Yüksek çözünürlüklü kart görseli (dokümantasyon/önizleme) veya tek katman
// siyah-beyaz üretim çıktısı (toner transfer, film).

import type { CopperLayer, Footprint, Project } from '../types'
import {
  allDrills,
  copperLayerGeometry,
  silkLayerGeometry,
  type CopperPrimitive
} from './exportGeometry'
import { rasterizeCopper } from './rasterize'
import { downloadBlob } from './files'
import { outlinePoints } from './exportGeometry'

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

  // Kart zemini (lehim maskesi rengi)
  ctx.fillStyle = project.board.color || '#1a5c2a'
  const outline = outlinePoints(project)
  ctx.beginPath()
  ctx.moveTo(outline[0].x, outline[0].y)
  for (const p of outline.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  ctx.fill()

  const layers: { layer: CopperLayer; color: string; alpha: number }[] = [
    { layer: 'bottom', color: '#3a6fd0', alpha: 0.8 },
    { layer: 'top', color: '#d0402f', alpha: 0.9 }
  ]
  for (const { layer, color, alpha } of layers) {
    const geo = copperLayerGeometry(project, getFootprint, layer)
    ctx.globalAlpha = alpha * 0.4
    for (const z of geo.zones) {
      ctx.fillStyle = color
      ctx.fillRect(z.x, z.y, z.width, z.height)
    }
    ctx.globalAlpha = alpha
    drawPrimitives(ctx, geo.copper, color)
  }
  ctx.globalAlpha = 1

  // Silkscreen
  drawPrimitives(
    ctx,
    silkLayerGeometry(project, getFootprint, 'top'),
    '#eeeeee'
  )

  // Yerleştirilen görseller (üst silk)
  for (const im of project.images.filter((i) => i.layer === 'top-silk')) {
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
