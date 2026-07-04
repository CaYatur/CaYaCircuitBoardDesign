// ─── G-code dışa aktarımı (CNC) ───────────────────────────────────────────
// 1) İzolasyon frezeleme: bakır çevresinde takım yolu (bitmap kontur yöntemi)
// 2) Delik delme
// 3) Kart kesimi (kontur)
// Koordinat sistemi: CNC standardı — orijin sol alt, Y yukarı pozitif.

import type { CopperLayer, Footprint, Point, Project } from '../types'
import { allDrills, outlinePoints } from './exportGeometry'
import { extractContours, rasterizeCopper } from './rasterize'

export interface GcodeOptions {
  /** Takım / freze ucu çapı (mm) — izolasyon için tipik 0.1-0.3 V-bit */
  toolDiameter: number
  /** Kazıma derinliği (mm, pozitif değer aşağı) */
  cutDepth: number
  /** İlerleme hızı (mm/dk) */
  feedRate: number
  /** Dalma hızı (mm/dk) */
  plungeRate: number
  /** Güvenli yükseklik (mm) */
  safeZ: number
  /** İş mili devri */
  spindleRpm: number
  /** Alt katman için X aynala */
  mirror: boolean
}

export const defaultGcodeOptions = (): GcodeOptions => ({
  toolDiameter: 0.2,
  cutDepth: 0.05,
  feedRate: 150,
  plungeRate: 60,
  safeZ: 2,
  spindleRpm: 10000,
  mirror: false
})

const f = (v: number) => v.toFixed(3)

function header(title: string, opts: { spindleRpm: number; safeZ: number }): string[] {
  return [
    `; CaYa PCB Studio — ${title}`,
    `; ${new Date().toISOString()}`,
    'G21 ; metrik',
    'G90 ; mutlak konum',
    `G0 Z${f(opts.safeZ)}`,
    `M3 S${opts.spindleRpm}`,
    'G4 P2 ; is milinin hizlanmasini bekle'
  ]
}

function footer(safeZ: number): string[] {
  return [`G0 Z${f(safeZ)}`, 'M5', 'G0 X0 Y0', 'M2']
}

/** Kart koordinatını CNC koordinatına çevir (Y çevrilir, istenirse X aynalanır) */
function toCnc(p: Point, boardW: number, boardH: number, mirror: boolean): Point {
  return {
    x: mirror ? boardW - p.x : p.x,
    y: boardH - p.y
  }
}

/**
 * İzolasyon frezeleme G-code'u.
 * Bakır, takım yarıçapı kadar şişirilerek bitmap'e çizilir; çıkan konturlar
 * takım merkez yoludur (bakır kenarından tam takım yarıçapı uzakta).
 */
export function gcodeIsolation(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer,
  opts: GcodeOptions
): string {
  const pxPerMm = 20 // 0.05 mm çözünürlük
  const { canvas } = rasterizeCopper(
    project,
    getFootprint,
    layer,
    pxPerMm,
    opts.toolDiameter / 2
  )
  const contours = extractContours(canvas, pxPerMm)
  const bw = project.board.width
  const bh = project.board.height

  const lines = header(
    `Izolasyon frezeleme — ${layer === 'top' ? 'UST' : 'ALT'} katman${opts.mirror ? ' (aynali)' : ''}`,
    opts
  )
  lines.push(`; takim capi: ${opts.toolDiameter} mm, derinlik: ${opts.cutDepth} mm`)
  lines.push(`; ${contours.length} kontur`)

  for (const contour of contours) {
    if (contour.length < 2) continue
    const pts = contour.map((p) => toCnc(p, bw, bh, opts.mirror))
    lines.push(`G0 Z${f(opts.safeZ)}`)
    lines.push(`G0 X${f(pts[0].x)} Y${f(pts[0].y)}`)
    lines.push(`G1 Z${f(-opts.cutDepth)} F${opts.plungeRate}`)
    for (let i = 1; i < pts.length; i++) {
      lines.push(`G1 X${f(pts[i].x)} Y${f(pts[i].y)} F${opts.feedRate}`)
    }
    // Konturu kapat
    lines.push(`G1 X${f(pts[0].x)} Y${f(pts[0].y)} F${opts.feedRate}`)
  }

  lines.push(...footer(opts.safeZ))
  return lines.join('\n') + '\n'
}

/** Delik delme G-code'u (çaplara göre takım değişimi duraklamalı) */
export function gcodeDrill(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  opts: GcodeOptions & { drillDepth?: number }
): string {
  const drills = allDrills(project, getFootprint)
  const bw = project.board.width
  const bh = project.board.height
  const depth = opts.drillDepth ?? 1.8

  const groups = new Map<string, { dia: number; holes: Point[] }>()
  for (const d of drills) {
    const k = d.diameter.toFixed(2)
    if (!groups.has(k)) groups.set(k, { dia: d.diameter, holes: [] })
    groups.get(k)!.holes.push({ x: d.x, y: d.y })
  }
  const sorted = [...groups.values()].sort((a, b) => a.dia - b.dia)

  const lines = header('Delik delme', opts)
  lines.push(`; ${drills.length} delik, ${sorted.length} farkli cap`)

  sorted.forEach((g, i) => {
    lines.push('')
    lines.push(`; --- Takim ${i + 1}: ${g.dia.toFixed(2)} mm matkap (${g.holes.length} delik) ---`)
    if (i > 0) {
      lines.push('M5')
      lines.push(`M0 ; TAKIM DEGISTIR: ${g.dia.toFixed(2)} mm — devam icin baslat`)
      lines.push(`M3 S${opts.spindleRpm}`)
    }
    for (const hole of g.holes) {
      const p = toCnc(hole, bw, bh, opts.mirror)
      lines.push(`G0 X${f(p.x)} Y${f(p.y)}`)
      lines.push(`G1 Z${f(-depth)} F${opts.plungeRate}`)
      lines.push(`G0 Z${f(opts.safeZ)}`)
    }
  })

  lines.push(...footer(opts.safeZ))
  return lines.join('\n') + '\n'
}

/** Kart kesimi (kontur) G-code'u — çok pasolu */
export function gcodeOutlineCut(
  project: Project,
  opts: GcodeOptions & { boardThickness?: number; passDepth?: number }
): string {
  const thickness = opts.boardThickness ?? 1.6
  const passDepth = opts.passDepth ?? 0.6
  const bw = project.board.width
  const bh = project.board.height
  // Takım yarıçapı kadar dışa ofset (kaba: dikdörtgen büyütme)
  const r = opts.toolDiameter / 2
  const pts = outlinePoints(project).map((p) => ({
    x: p.x < bw / 2 ? p.x - r : p.x + r,
    y: p.y < bh / 2 ? p.y - r : p.y + r
  }))

  const lines = header('Kart kesimi (kontur)', opts)
  lines.push(`; kalinlik: ${thickness} mm, paso: ${passDepth} mm`)
  lines.push('; NOT: karti sabitlemek icin yapiskan bant/vakum kullanin — sekme (tab) eklenmez')

  const passes = Math.ceil(thickness / passDepth)
  for (let pass = 1; pass <= passes; pass++) {
    const depth = Math.min(pass * passDepth, thickness + 0.1)
    lines.push(`; paso ${pass}/${passes} — Z=-${f(depth)}`)
    const cnc = pts.map((p) => toCnc(p, bw, bh, opts.mirror))
    lines.push(`G0 X${f(cnc[0].x)} Y${f(cnc[0].y)}`)
    lines.push(`G1 Z${f(-depth)} F${opts.plungeRate}`)
    for (let i = 1; i < cnc.length; i++) {
      lines.push(`G1 X${f(cnc[i].x)} Y${f(cnc[i].y)} F${opts.feedRate}`)
    }
    lines.push(`G0 Z${f(opts.safeZ)}`)
  }

  lines.push(...footer(opts.safeZ))
  return lines.join('\n') + '\n'
}
