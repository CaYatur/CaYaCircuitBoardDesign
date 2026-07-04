// ─── Elektriksel hesaplamalar ─────────────────────────────────────────────
// IPC-2221 standardına göre iz genişliği / akım taşıma kapasitesi,
// iz direnci, gerilim düşümü, via akım kapasitesi.

/** 1 oz/ft² bakır kalınlığı (mm) */
export const OZ_TO_MM = 0.0347

/** Bakır özdirenci, 25°C (Ω·mm) */
const COPPER_RESISTIVITY = 1.68e-5 // 1.68e-8 Ω·m = 1.68e-5 Ω·mm

export const mmToMil = (mm: number): number => mm / 0.0254
export const milToMm = (mil: number): number => mil * 0.0254

/**
 * IPC-2221: I = k · ΔT^0.44 · A^0.725
 * A: kesit alanı (mil²), k: dış katman 0.048, iç katman 0.024
 * Verilen akım için gereken iz genişliğini (mm) döndürür.
 */
export function traceWidthForCurrent(
  currentA: number,
  tempRiseC: number,
  copperOz: number,
  external = true
): number {
  if (currentA <= 0 || tempRiseC <= 0 || copperOz <= 0) return 0
  const k = external ? 0.048 : 0.024
  const areaMil2 = Math.pow(currentA / (k * Math.pow(tempRiseC, 0.44)), 1 / 0.725)
  const thicknessMil = mmToMil(copperOz * OZ_TO_MM)
  return milToMm(areaMil2 / thicknessMil)
}

/** Verilen iz genişliğinin taşıyabileceği akımı (A) döndürür (IPC-2221) */
export function currentForTraceWidth(
  widthMm: number,
  tempRiseC: number,
  copperOz: number,
  external = true
): number {
  if (widthMm <= 0 || tempRiseC <= 0 || copperOz <= 0) return 0
  const k = external ? 0.048 : 0.024
  const areaMil2 = mmToMil(widthMm) * mmToMil(copperOz * OZ_TO_MM)
  return k * Math.pow(tempRiseC, 0.44) * Math.pow(areaMil2, 0.725)
}

/** İz direnci (Ω). Sıcaklık katsayısı %0.393/°C ile düzeltilir. */
export function traceResistance(
  lengthMm: number,
  widthMm: number,
  copperOz: number,
  tempC = 25
): number {
  if (widthMm <= 0 || copperOz <= 0) return 0
  const areaMm2 = widthMm * copperOz * OZ_TO_MM
  const r25 = (COPPER_RESISTIVITY * lengthMm) / areaMm2
  return r25 * (1 + 0.00393 * (tempC - 25))
}

/** İz üzerindeki gerilim düşümü (V) ve güç kaybı (W) */
export function traceVoltageDrop(
  lengthMm: number,
  widthMm: number,
  copperOz: number,
  currentA: number
): { resistance: number; voltageDrop: number; powerLoss: number } {
  const resistance = traceResistance(lengthMm, widthMm, copperOz)
  return {
    resistance,
    voltageDrop: resistance * currentA,
    powerLoss: resistance * currentA * currentA
  }
}

/**
 * Via akım kapasitesi (A): namlu kesit alanı üzerinden IPC-2221 iç katman
 * formülü. platingUm: kaplama kalınlığı (tipik 25 µm).
 */
export function viaCurrentCapacity(
  drillMm: number,
  tempRiseC: number,
  platingUm = 25
): number {
  if (drillMm <= 0 || tempRiseC <= 0) return 0
  const platingMm = platingUm / 1000
  // Namlu kesit alanı: π · (d + t) · t
  const areaMm2 = Math.PI * (drillMm + platingMm) * platingMm
  const areaMil2 = areaMm2 / (0.0254 * 0.0254)
  return 0.024 * Math.pow(tempRiseC, 0.44) * Math.pow(areaMil2, 0.725)
}

/** Via halka genişliği (annular ring) */
export const annularRing = (diameter: number, drill: number): number =>
  (diameter - drill) / 2

/**
 * Mikroşerit (microstrip) karakteristik empedans (Ω) — IPC-2141 yaklaşımı.
 * h: dielektrik kalınlığı, w: iz genişliği, t: bakır kalınlığı (mm), er: bağıl geçirgenlik
 */
export function microstripImpedance(
  wMm: number,
  hMm: number,
  tMm: number,
  er = 4.5
): number {
  if (wMm <= 0 || hMm <= 0) return 0
  return (
    (87 / Math.sqrt(er + 1.41)) *
    Math.log((5.98 * hMm) / (0.8 * wMm + tMm))
  )
}

/** Paralel plaka kapasitansı (pF) — bakır dolgu alanları için kestirim */
export function planeCapacitance(
  areaMm2: number,
  hMm: number,
  er = 4.5
): number {
  if (hMm <= 0) return 0
  // C = ε0 · εr · A / d ; ε0 = 8.854e-12 F/m = 8.854e-3 pF/mm
  return (8.854e-3 * er * areaMm2) / hMm
}

/** Direnç renk kodu çözümleme (4 bant) — kütüphane yardımcıları için */
export const resistorColorBands: Record<string, number> = {
  siyah: 0, kahverengi: 1, kırmızı: 2, turuncu: 3, sarı: 4,
  yeşil: 5, mavi: 6, mor: 7, gri: 8, beyaz: 9
}

/** Okunabilir birim biçimlendirme */
export function formatOhm(r: number): string {
  if (r >= 1e6) return `${(r / 1e6).toFixed(2)} MΩ`
  if (r >= 1e3) return `${(r / 1e3).toFixed(2)} kΩ`
  if (r >= 1) return `${r.toFixed(3)} Ω`
  return `${(r * 1000).toFixed(2)} mΩ`
}

export function formatMm(v: number): string {
  return `${v.toFixed(v < 1 ? 3 : 2)} mm`
}
