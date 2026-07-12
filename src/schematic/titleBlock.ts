// ─── Şema sayfa çerçevesi + başlık bloğu (title block) ────────────────────
// Profesyonel devre şeması sayfasının kenar çerçevesini ve sağ-alt köşedeki
// başlık bloğunu (TITLE/REV/Sheet/Date/tasarımcı + serbest notlar) üretir.
// Çıktı, konumu dünya (şema) koordinatlarında ilkeller (çizgi/metin) listesidir;
// hem ekran editörü (canvas) hem SVG/PNG dışa aktarımı aynı yerleşimi kullanır.

import type { Footprint, Project, TitleBlock } from '../types'
import { defaultTitleBlock } from '../types'
import { symbolBBox, symbolLayout } from './model'

export interface SheetBounds {
  minX: number
  minY: number
  width: number
  height: number
}

export type TitlePrim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number }
  | {
      t: 'text'
      x: number
      y: number
      text: string
      size: number
      bold?: boolean
      align: 'left' | 'center' | 'right'
      role: 'label' | 'value' | 'title'
    }

export interface Sheet {
  /** Dış çerçeve (dünya koordinatları) */
  frame: { x: number; y: number; w: number; h: number }
  /** Başlık bloğu kutusu (dünya koordinatları) */
  block: { x: number; y: number; w: number; h: number }
  prims: TitlePrim[]
}

/** Tüm sembol + tellerin kapsadığı içerik sınırları (pay dahil) */
export function schematicContentBounds(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): SheetBounds {
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
    grow(bb.x, bb.y - 5)
    grow(bb.x + bb.width, bb.y + bb.height + 5)
  }
  for (const w of project.schematic.wires) {
    for (const p of w.points) grow(p.x, p.y)
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, width: 120, height: 80 }
  const margin = 8
  return { minX: minX - margin, minY: minY - margin, width: maxX - minX + margin * 2, height: maxY - minY + margin * 2 }
}

const BLOCK_W = 95
const BLOCK_H = 30

/**
 * İçerik sınırlarına göre sayfa çerçevesi + başlık bloğu yerleşimini kurar.
 * Başlık bloğu içeriğin ALTINDA ayrı bir şeride oturur → sembollerle çakışmaz.
 */
export function buildSheet(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): Sheet | null {
  const tb: TitleBlock = { ...defaultTitleBlock(), ...(project.schematic.titleBlock ?? {}) }
  if (!tb.enabled) return null

  const b = schematicContentBounds(project, getFootprint)
  const M = 6
  const frameX = b.minX - M
  const frameY = b.minY - M
  const frameW = Math.max(b.width + 2 * M, BLOCK_W + 2 * M)
  const frameH = b.height + 2 * M + BLOCK_H + 3
  const frame = { x: frameX, y: frameY, w: frameW, h: frameH }
  const block = { x: frameX + frameW - BLOCK_W, y: frameY + frameH - BLOCK_H, w: BLOCK_W, h: BLOCK_H }

  const prims: TitlePrim[] = []
  const line = (x1: number, y1: number, x2: number, y2: number, w = 0.4) =>
    prims.push({ t: 'line', x1, y1, x2, y2, w })
  const text = (
    x: number,
    y: number,
    txt: string,
    size: number,
    align: 'left' | 'center' | 'right',
    role: 'label' | 'value' | 'title',
    bold = false
  ) => {
    if (txt) prims.push({ t: 'text', x, y, text: txt, size, align, role, bold })
  }

  // Dış çerçeve (çift çizgi görünümü)
  line(frame.x, frame.y, frame.x + frame.w, frame.y, 0.6)
  line(frame.x + frame.w, frame.y, frame.x + frame.w, frame.y + frame.h, 0.6)
  line(frame.x + frame.w, frame.y + frame.h, frame.x, frame.y + frame.h, 0.6)
  line(frame.x, frame.y + frame.h, frame.x, frame.y, 0.6)

  // Başlık bloğu dış kutusu
  const bx = block.x
  const by = block.y
  line(bx, by, bx + block.w, by, 0.5)
  line(bx, by, bx, by + block.h, 0.5)

  // Satır düzeni
  const titleH = 11
  const rowH = (block.h - titleH) / 3
  const colX = bx + block.w * 0.6 // sol/sağ sütun ayrımı

  // Başlık satırı ayırıcısı
  line(bx, by + titleH, bx + block.w, by + titleH, 0.4)
  // Alt satır ayırıcıları
  line(bx, by + titleH + rowH, bx + block.w, by + titleH + rowH, 0.3)
  line(bx, by + titleH + rowH * 2, bx + block.w, by + titleH + rowH * 2, 0.3)
  // Sütun ayırıcı (alt 3 satır)
  line(colX, by + titleH, colX, by + block.h, 0.3)

  const pad = 2
  // TITLE
  text(bx + pad, by + 4, 'TITLE', 2, 'left', 'label')
  text(bx + pad, by + titleH - 2.5, tb.title || project.name, 4.4, 'left', 'title', true)

  // Sol sütun satırları
  const leftCell = (row: number, label: string, value: string) => {
    const y0 = by + titleH + rowH * row
    text(bx + pad, y0 + 2.6, label, 1.8, 'left', 'label')
    text(bx + pad, y0 + rowH - 1.4, value, 2.6, 'left', 'value')
  }
  const rightCell = (row: number, label: string, value: string) => {
    const y0 = by + titleH + rowH * row
    text(colX + pad, y0 + 2.6, label, 1.8, 'left', 'label')
    text(colX + pad, y0 + rowH - 1.4, value, 2.6, 'left', 'value')
  }
  leftCell(0, 'COMPANY', tb.company)
  leftCell(1, 'DESIGNED BY', tb.author)
  leftCell(2, 'REVISED BY', tb.revisedBy)
  rightCell(0, 'REV', tb.revision)
  rightCell(1, 'SHEET', tb.sheet + (tb.size ? ' · ' + tb.size : ''))
  rightCell(2, 'DATE', tb.date)

  // Serbest notlar (açıklamalar) — başlık bloğunun solundaki boş şeritte
  if (tb.notes.trim()) {
    const notesX = frame.x + 3
    let ny = block.y + 4
    for (const raw of tb.notes.split('\n')) {
      const l = raw.trimEnd()
      if (ny > block.y + block.h - 1) break
      text(notesX, ny, l, 2.8, 'left', 'value')
      ny += 4.1
    }
  }

  return { frame, block, prims }
}
