// ─── Gerber RS-274X dışa aktarımı ─────────────────────────────────────────
// PCB üreticilerinin kabul ettiği standart format. Bakır alanların
// (zone) diğer netlere boşluk bırakması LPC (clear) polaritesiyle sağlanır.

import type { CopperLayer, Footprint, Project } from '../types'
import {
  copperLayerGeometry,
  outlinePoints,
  silkLayerGeometry,
  type CopperPrimitive
} from './exportGeometry'

// Koordinat: mm × 10^6, FSLAX46Y46. Y ekseni Gerber'de yukarı pozitif olduğu
// için y' = kartYüksekliği - y dönüşümü uygulanır.
const fmt = (v: number): string => Math.round(v * 1e6).toString()

class GerberBuilder {
  private lines: string[] = []
  private apertures = new Map<string, number>()
  private nextD = 10
  private currentD = -1
  private boardH: number

  constructor(layerName: string, boardH: number) {
    this.boardH = boardH
    this.lines.push(
      `%TF.GenerationSoftware,CaYa,PCB Studio,1.0*%`,
      `%TF.FileFunction,${layerName}*%`,
      '%FSLAX46Y46*%',
      '%MOMM*%',
      'G01*',
      '%LPD*%'
    )
  }

  private y(v: number): number {
    return this.boardH - v
  }

  /** Aperture tanımla veya var olanı getir */
  aperture(def: string): number {
    let d = this.apertures.get(def)
    if (d === undefined) {
      d = this.nextD++
      this.apertures.set(def, d)
    }
    return d
  }

  circleAp(dia: number): number {
    return this.aperture(`C,${dia.toFixed(6)}`)
  }

  rectAp(w: number, h: number): number {
    return this.aperture(`R,${w.toFixed(6)}X${h.toFixed(6)}`)
  }

  ovalAp(w: number, h: number): number {
    return this.aperture(`O,${w.toFixed(6)}X${h.toFixed(6)}`)
  }

  select(d: number): void {
    if (this.currentD !== d) {
      this.lines.push(`D${d}*`)
      this.currentD = d
    }
  }

  polarity(dark: boolean): void {
    this.lines.push(dark ? '%LPD*%' : '%LPC*%')
  }

  stroke(points: { x: number; y: number }[], width: number): void {
    if (points.length < 2) return
    this.select(this.circleAp(Math.max(width, 0.01)))
    this.lines.push(`X${fmt(points[0].x)}Y${fmt(this.y(points[0].y))}D02*`)
    for (let i = 1; i < points.length; i++) {
      this.lines.push(`X${fmt(points[i].x)}Y${fmt(this.y(points[i].y))}D01*`)
    }
  }

  flash(x: number, y: number, d: number): void {
    this.select(d)
    this.lines.push(`X${fmt(x)}Y${fmt(this.y(y))}D03*`)
  }

  region(points: { x: number; y: number }[]): void {
    this.lines.push('G36*')
    this.lines.push(`X${fmt(points[0].x)}Y${fmt(this.y(points[0].y))}D02*`)
    for (let i = 1; i < points.length; i++) {
      this.lines.push(`X${fmt(points[i].x)}Y${fmt(this.y(points[i].y))}D01*`)
    }
    this.lines.push('G37*')
  }

  build(): string {
    // Aperture tanımlarını başa yerleştir
    const apLines: string[] = []
    for (const [def, d] of this.apertures) {
      apLines.push(`%ADD${d}${def}*%`)
    }
    const head = this.lines.slice(0, 6)
    const body = this.lines.slice(6)
    return [...head, ...apLines, ...body, 'M02*'].join('\n') + '\n'
  }
}

function drawPrimitive(gb: GerberBuilder, item: CopperPrimitive, inflate = 0): void {
  if (item.kind === 'stroke') {
    gb.stroke(item.points, item.width + 2 * inflate)
  } else {
    const w = item.width + 2 * inflate
    const h = item.height + 2 * inflate
    let d: number
    if (item.shape === 'circle') d = gb.circleAp(Math.max(w, h))
    else if (item.shape === 'rect') d = gb.rectAp(w, h)
    else d = gb.ovalAp(w, h)
    gb.flash(item.x, item.y, d)
  }
}

/** Tek bakır katmanın Gerber çıktısı */
export function gerberCopperLayer(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  layer: CopperLayer
): string {
  const fn = layer === 'top' ? 'Copper,L1,Top' : 'Copper,L2,Bot'
  const gb = new GerberBuilder(fn, project.board.height)
  const geo = copperLayerGeometry(project, getFootprint, layer)

  // 1) Bakır alanlar (dark)
  for (const z of geo.zones) {
    gb.region([
      { x: z.x, y: z.y },
      { x: z.x + z.width, y: z.y },
      { x: z.x + z.width, y: z.y + z.height },
      { x: z.x, y: z.y + z.height },
      { x: z.x, y: z.y }
    ])
  }

  // 2) Zone varsa: farklı netlerin çevresini boşalt (clear)
  if (geo.zones.length > 0) {
    const clearance = Math.max(...geo.zones.map((z) => z.clearance))
    gb.polarity(false)
    for (const item of geo.copper) {
      const belongsToAllZones = geo.zones.every((z) => z.net !== '' && item.net === z.net)
      if (!belongsToAllZones) drawPrimitive(gb, item, clearance)
    }
    gb.polarity(true)
  }

  // 3) Tüm bakır (dark)
  for (const item of geo.copper) {
    drawPrimitive(gb, item)
  }

  return gb.build()
}

/** Silkscreen katmanı Gerber çıktısı */
export function gerberSilkLayer(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer
): string {
  const fn = side === 'top' ? 'Legend,Top' : 'Legend,Bot'
  const gb = new GerberBuilder(fn, project.board.height)
  for (const s of silkLayerGeometry(project, getFootprint, side)) {
    gb.stroke(s.points, s.width)
  }
  return gb.build()
}

/** Kart dış hattı (Edge.Cuts) Gerber çıktısı */
export function gerberOutline(project: Project): string {
  const gb = new GerberBuilder('Profile,NP', project.board.height)
  gb.stroke(outlinePoints(project), 0.15)
  // Montaj delikleri çevresi (bilgi amaçlı çizilmez — delik dosyasında)
  return gb.build()
}

/** Tüm Gerber setini üret */
export function gerberFileSet(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): { name: string; content: string }[] {
  const base = sanitize(project.name)
  return [
    { name: `${base}-F_Cu.gtl`, content: gerberCopperLayer(project, getFootprint, 'top') },
    { name: `${base}-B_Cu.gbl`, content: gerberCopperLayer(project, getFootprint, 'bottom') },
    { name: `${base}-F_Silk.gto`, content: gerberSilkLayer(project, getFootprint, 'top') },
    { name: `${base}-B_Silk.gbo`, content: gerberSilkLayer(project, getFootprint, 'bottom') },
    { name: `${base}-Edge_Cuts.gm1`, content: gerberOutline(project) }
  ]
}

export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'kart'
}
