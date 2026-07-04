// ─── Vektör (stroke) yazı tipi ────────────────────────────────────────────
// Silkscreen yazıları hem ekranda hem Gerber/SVG/G-code dışa aktarımında
// aynı çizgi tabanlı fontla üretilir. Glifler 4 birim genişlik × 6 birim
// yükseklik ızgarasında tanımlıdır (y aşağı pozitif, 6 = taban çizgisi).

import type { FontStyle, Point, Rotation } from '../types'
import { rotatePoint } from '../core/geometry'

/** Yazı stiline göre metrik: karakter ilerlemesi çarpanı ve eğim (slant) */
function styleMetrics(font: FontStyle): { advanceMul: number; slant: number } {
  switch (font) {
    case 'italic': return { advanceMul: 1, slant: 0.28 }
    case 'wide': return { advanceMul: 1.35, slant: 0 }
    case 'condensed': return { advanceMul: 0.72, slant: 0 }
    case 'script': return { advanceMul: 0.96, slant: 0.36 }
    default: return { advanceMul: 1, slant: 0 }
  }
}

type Glyph = number[][] // her dizi bir polyline: [x1,y1,x2,y2,...]

const G: Record<string, Glyph> = {
  A: [[0, 6, 0, 2, 2, 0, 4, 2, 4, 6], [0, 4, 4, 4]],
  B: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3], [3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  D: [[0, 0, 0, 6, 2, 6, 4, 4, 4, 2, 2, 0, 0, 0]],
  E: [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
  F: [[4, 0, 0, 0, 0, 6], [0, 3, 3, 3]],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3, 2, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[2, 0, 2, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5]],
  K: [[0, 0, 0, 6], [4, 0, 0, 3, 4, 6]],
  L: [[0, 0, 0, 6, 4, 6]],
  M: [[0, 6, 0, 0, 2, 3, 4, 0, 4, 6]],
  N: [[0, 6, 0, 0, 4, 6, 4, 0]],
  O: [[0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 1, 3, 0, 1, 0, 0, 1]],
  P: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3]],
  Q: [[0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 1, 3, 0, 1, 0, 0, 1], [2, 4, 4, 6]],
  R: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3], [2, 3, 4, 6]],
  S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  T: [[2, 0, 2, 6], [0, 0, 4, 0]],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
  V: [[0, 0, 2, 6, 4, 0]],
  W: [[0, 0, 1, 6, 2, 3, 3, 6, 4, 0]],
  X: [[0, 0, 4, 6], [4, 0, 0, 6]],
  Y: [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]],
  Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
  '0': [[0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 1, 3, 0, 1, 0, 0, 1], [3, 1.5, 1, 4.5]],
  '1': [[1, 1, 2, 0, 2, 6], [1, 6, 3, 6]],
  '2': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 0, 6, 4, 6]],
  '3': [[0, 0, 4, 0, 2, 2, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  '4': [[3, 6, 3, 0, 0, 4, 4, 4]],
  '5': [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  '6': [[4, 0, 1, 0, 0, 2, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  '7': [[0, 0, 4, 0, 2, 6]],
  '8': [[1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3, 0, 2, 0, 1, 1, 0], [1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3]],
  '9': [[4, 3, 1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 4, 3, 6, 0, 6]],
  '-': [[1, 3, 3, 3]],
  '+': [[2, 1, 2, 5], [0, 3, 4, 3]],
  '.': [[2, 5.4, 2, 6]],
  ',': [[2, 5, 1.4, 6.6]],
  ':': [[2, 1.4, 2, 2], [2, 4.4, 2, 5]],
  '/': [[0, 6, 4, 0]],
  '\\': [[0, 0, 4, 6]],
  '(': [[3, 0, 2, 1, 2, 5, 3, 6]],
  ')': [[1, 0, 2, 1, 2, 5, 1, 6]],
  _: [[0, 6, 4, 6]],
  '=': [[0, 2, 4, 2], [0, 4, 4, 4]],
  '%': [[0, 6, 4, 0], [0.5, 0, 1.5, 0, 1.5, 1, 0.5, 1, 0.5, 0], [2.5, 5, 3.5, 5, 3.5, 6, 2.5, 6, 2.5, 5]],
  'Ω': [[0, 6, 1.2, 6, 1.2, 5, 0.3, 4, 0, 3, 0, 1.5, 1, 0, 3, 0, 4, 1.5, 4, 3, 3.7, 4, 2.8, 5, 2.8, 6, 4, 6]],
  '×': [[1, 2, 3, 4], [3, 2, 1, 4]],
  '*': [[2, 1, 2, 5], [0.5, 2, 3.5, 4], [3.5, 2, 0.5, 4]],
  "'": [[2, 0, 2, 1.4]],
  '"': [[1.4, 0, 1.4, 1.4], [2.6, 0, 2.6, 1.4]],
  '?': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 2, 3.2, 2, 4.2], [2, 5.4, 2, 6]],
  '!': [[2, 0, 2, 4], [2, 5.4, 2, 6]],
  '#': [[1, 0, 1, 6], [3, 0, 3, 6], [0, 2, 4, 2], [0, 4, 4, 4]],
  '<': [[3, 1, 1, 3, 3, 5]],
  '>': [[1, 1, 3, 3, 1, 5]],
  '[': [[3, 0, 2, 0, 2, 6, 3, 6]],
  ']': [[1, 0, 2, 0, 2, 6, 1, 6]],
  '@': [[3, 4, 3, 2, 1.6, 2, 1.6, 4, 3, 4, 4, 3.2, 4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3.6, 6]],
  '&': [[4, 6, 0.6, 2.2, 0.6, 1, 1.6, 0, 2.6, 1, 2.6, 2.2, 0, 4.4, 0, 5.4, 1, 6, 2.4, 6, 4, 3.6]],
  µ: [[0, 2, 0, 7.4], [0, 5, 1, 6, 3, 6, 4, 5], [4, 2, 4, 6]],
  '°': [[1.4, 0, 2.6, 0, 2.6, 1.2, 1.4, 1.2, 1.4, 0]]
}

// Türkçe karakterler temel harflere eşlenir
const TR_MAP: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'O', ş: 'S', ü: 'U'
}

const GRID_H = 6 // glif yüksekliği (birim)
const ADVANCE = 5.6 // karakter ilerleme (birim)

/**
 * Metni dünya koordinatlarında polyline listesine dönüştürür.
 * @param size büyük harf yüksekliği (mm)
 * @returns polylines + önerilen çizgi kalınlığı
 */
export function placeText(
  text: string,
  anchor: Point,
  size: number,
  rotation: Rotation = 0,
  mirror = false,
  align: 'center' | 'left' = 'center',
  opts: { font?: FontStyle } = {}
): { strokes: Point[][]; strokeWidth: number } {
  const { advanceMul, slant } = styleMetrics(opts.font ?? 'standard')
  const advance = ADVANCE * advanceMul
  const scale = size / GRID_H
  const chars = [...text]
  const totalW = chars.length * advance * scale
  const startX = align === 'center' ? -totalW / 2 : 0
  const strokes: Point[][] = []

  chars.forEach((ch, ci) => {
    let key = ch
    if (TR_MAP[key]) key = TR_MAP[key]
    if (!G[key]) key = key.toUpperCase()
    if (TR_MAP[key]) key = TR_MAP[key]
    const glyph = G[key]
    if (!glyph) return // boşluk/bilinmeyen
    const cx = startX + ci * advance * scale
    for (const poly of glyph) {
      const pts: Point[] = []
      for (let i = 0; i < poly.length; i += 2) {
        // Glifi dikeyde ortala (taban -3..+3); italik/el yazısı için eğ (shear)
        const gy = poly[i + 1] - GRID_H / 2
        let x = cx + (poly[i] - slant * gy) * scale
        let y = gy * scale
        if (mirror) x = -x
        const r = rotatePoint({ x, y }, rotation)
        pts.push({ x: r.x + anchor.x, y: r.y + anchor.y })
      }
      strokes.push(pts)
    }
  })

  return { strokes, strokeWidth: Math.max(0.12, size * 0.14) }
}

/** Metnin kaplayacağı genişlik (mm) */
export const textWidth = (text: string, size: number, font: FontStyle = 'standard'): number =>
  [...text].length * ADVANCE * styleMetrics(font).advanceMul * (size / GRID_H)
