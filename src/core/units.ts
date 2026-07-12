// ─── Ölçü birimi dönüşümleri (mm ↔ mil ↔ inç) ─────────────────────────────
// ÖNEMLİ: Uygulamadaki TÜM geometri milimetre (mm) cinsinden saklanır. Bu
// modül yalnızca gösterim ve sayısal giriş içindir — birim değiştirmek asla
// depolanan geometriyi değiştirmez. 1 inç = 25.4 mm = 1000 mil.

import type { MeasureUnit } from '../types'

export const MM_PER_INCH = 25.4
export const MIL_PER_INCH = 1000

/** mm → seçili birimdeki sayısal değer */
export function toUnit(mm: number, u: MeasureUnit): number {
  if (u === 'mil') return (mm / MM_PER_INCH) * MIL_PER_INCH
  if (u === 'inch') return mm / MM_PER_INCH
  return mm
}

/** Seçili birimdeki değer → mm */
export function fromUnit(v: number, u: MeasureUnit): number {
  if (u === 'mil') return (v / MIL_PER_INCH) * MM_PER_INCH
  if (u === 'inch') return v * MM_PER_INCH
  return v
}

/** Kısa birim eki: mm / mil / in */
export function unitSuffix(u: MeasureUnit): string {
  return u === 'inch' ? 'in' : u
}

/** Birime göre makul ondalık hane sayısı */
export function unitDecimals(u: MeasureUnit): number {
  if (u === 'mil') return 1
  if (u === 'inch') return 4
  return 2
}

/** mm değerini seçili birimde biçimlendir (yalnız sayı, birim eki yok) */
export function formatLen(mm: number, u: MeasureUnit, decimals?: number): string {
  const d = decimals ?? unitDecimals(u)
  return toUnit(mm, u).toFixed(d)
}

/** mm değerini birim ekiyle biçimlendir: örn. "12.34 mm", "485.0 mil" */
export function formatLenU(mm: number, u: MeasureUnit, decimals?: number): string {
  return `${formatLen(mm, u, decimals)} ${unitSuffix(u)}`
}

/** Kullanıcının (seçili birimde) girdiği metni mm'ye çevir; geçersizse null */
export function parseLen(str: string, u: MeasureUnit): number | null {
  const v = parseFloat(str)
  if (!isFinite(v)) return null
  return fromUnit(v, u)
}

/** Bir sonraki birime döngüsel geç (mm → mil → inç → mm) */
export function nextUnit(u: MeasureUnit): MeasureUnit {
  return u === 'mm' ? 'mil' : u === 'mil' ? 'inch' : 'mm'
}
