// ─── Gerber RS-274X dışa aktarımı ─────────────────────────────────────────
// PCB üreticilerinin kabul ettiği standart format. Bakır alanların
// (zone) diğer netlere boşluk bırakması LPC (clear) polaritesiyle sağlanır.

import type { CopperLayer, Footprint, Project } from '../types'
import {
  copperLayerGeometry,
  layerPads,
  outlinePoints,
  silkLayerGeometry,
  type CopperPrimitive,
  type PadFlash
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

  // 1) Bakır alanlar (zone dolguları — otomatik hesaplanmış gerçek şekil):
  // her ada dış sınırı dark, delikleri (foreign-net boşluk + thermal relief) clear
  for (const z of geo.zones) {
    for (const isl of z.islands) {
      if (isl.outer.length < 3) continue
      gb.polarity(true)
      gb.region([...isl.outer, isl.outer[0]])
      for (const hole of isl.holes) {
        if (hole.length < 3) continue
        gb.polarity(false)
        gb.region([...hole, hole[0]])
      }
    }
  }
  gb.polarity(true)

  // 2) Tüm bakır (dark)
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

/** Bir pad'i (opsiyonel genişleme ile) uygun aperture'la flash eder */
function flashPad(gb: GerberBuilder, p: PadFlash, inflate: number): void {
  const w = p.width + 2 * inflate
  const h = p.height + 2 * inflate
  let d: number
  if (p.shape === 'circle') d = gb.circleAp(Math.max(w, h))
  else if (p.shape === 'rect') d = gb.rectAp(w, h)
  else d = gb.ovalAp(w, h)
  gb.flash(p.x, p.y, d)
}

/**
 * Lehim maskesi (solder mask) Gerber çıktısı — pad'lerin açık kalacağı
 * bölgeler. Standart ~0.05 mm maske genişlemesi uygulanır (pad kenarında
 * temiz bakır açığı). Delikli pad'ler her iki yüzde de açılır.
 */
export function gerberSolderMask(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer
): string {
  const fn = side === 'top' ? 'Soldermask,Top' : 'Soldermask,Bot'
  const gb = new GerberBuilder(fn, project.board.height)
  for (const p of layerPads(project, getFootprint, side)) {
    flashPad(gb, p, 0.05)
  }
  return gb.build()
}

/**
 * Lehim pastası (solder paste / stencil) Gerber çıktısı — yalnız SMD pad'ler
 * (delikli pad'lere ve via'lara pasta uygulanmaz). Stencil kesimi için pad
 * boyutunda açılır.
 */
export function gerberSolderPaste(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  side: CopperLayer
): string {
  const fn = side === 'top' ? 'Paste,Top' : 'Paste,Bot'
  const gb = new GerberBuilder(fn, project.board.height)
  for (const p of layerPads(project, getFootprint, side)) {
    if (!p.smd) continue
    flashPad(gb, p, 0)
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
  const single = project.board.layerCount === 1
  const files = [
    { name: `${base}-F_Cu.gtl`, content: gerberCopperLayer(project, getFootprint, 'top') },
    { name: `${base}-F_Mask.gts`, content: gerberSolderMask(project, getFootprint, 'top') },
    { name: `${base}-F_Paste.gtp`, content: gerberSolderPaste(project, getFootprint, 'top') },
    { name: `${base}-F_Silk.gto`, content: gerberSilkLayer(project, getFootprint, 'top') }
  ]
  if (!single) {
    files.push(
      { name: `${base}-B_Cu.gbl`, content: gerberCopperLayer(project, getFootprint, 'bottom') },
      { name: `${base}-B_Mask.gbs`, content: gerberSolderMask(project, getFootprint, 'bottom') },
      { name: `${base}-B_Paste.gbp`, content: gerberSolderPaste(project, getFootprint, 'bottom') },
      { name: `${base}-B_Silk.gbo`, content: gerberSilkLayer(project, getFootprint, 'bottom') }
    )
  }
  files.push({ name: `${base}-Edge_Cuts.gm1`, content: gerberOutline(project) })
  return files
}

export function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'kart'
}
