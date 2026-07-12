// ─── 3B (Üç Boyutlu) Render Motoru ────────────────────────────────────────
// Bağımlılıksız, Canvas 2D tabanlı basit bir 3B sahne çizici. Kartı bir dilim
// (slab) olarak, bileşenleri kategoriye göre kutu/silindir katı cisimler olarak
// üretir; yüzeyleri kamera uzayına dönüştürüp derinliğe göre sıralar (ressam
// algoritması) ve sabit ışıkla gölgeleyerek çizer. Amaç: gerçekçi bir önizleme.

import type { ComponentInstance, Footprint, PadDef, Point, Project } from '../types'
import { componentBBox, localToWorld, padWorldPos, padDrillWorldPos, padWorldSize, rotatePoint, pointInPolygon } from '../core/geometry'
import { boardEditablePolygon, cutoutOutlinePoints, filletPolygon } from '../core/boardGeometry'
import { placeText } from './vectorFont'
import { getCachedImage } from './imageCache'

export interface V3 { x: number; y: number; z: number }

/**
 * Çizim sırası grubu — ressam algoritmasının büyük/küçük yüzey sıralama
 * hatalarını önlemek için yüzeyler mantıksal katmanlara ayrılır:
 * kameraya göre uzak taraf → kart → yakın taraf sırasıyla çizilir.
 */
export type FaceLayer = 'board' | 'flat-top' | 'flat-bottom' | 'body-top' | 'body-bottom'

/** Işıkla önceden gölgelenmiş, dünya uzayında düz (convex) çokgen yüzey */
export interface Face {
  pts: V3[]
  color: string
  layer: FaceLayer
  /** Kesim (cutout) delikleri gibi iç boşluklar — evenodd kuralıyla doldurulur */
  holes?: V3[][]
}

export interface Camera {
  yaw: number // yatay açı (rad)
  pitch: number // dikey açı (rad)
  dist: number // hedefe uzaklık (mm)
  target: V3
}

export interface Scene3DState {
  project: Project
  getFootprint: (id: string) => Footprint | undefined
  camera: Camera
  width: number
  height: number
  showComponents: boolean
  showTraces: boolean
  /** İçe aktarılmış 3B modelleri göster (varsayılan true) */
  showModels?: boolean
  /** Pad/pin adlarını kart üstünde etiket olarak göster */
  showPinLabels?: boolean
  /** Bir görsel (PNG/SVG) ilk kez yüklendiğinde yeniden çizim tetiklemek için */
  onImageLoad?: () => void
  /** Seçim aracıyla tıklanarak seçilen bileşenlerin id'leri — kart üzerinde vurgulanır */
  selectedComponentIds?: string[]
}

const BOARD_T = 1.6 // kart kalınlığı (mm)
const TOP_Z = BOARD_T / 2
const BOT_Z = -BOARD_T / 2

// ─── Vektör yardımcıları ──────────────────────────────────────────────────
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const normalize = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

const LIGHT = normalize({ x: 0.35, y: -0.5, z: 0.9 })

function shade(rgb: [number, number, number], normal: V3): string {
  const s = 0.42 + 0.58 * Math.abs(dot(normal, LIGHT))
  const r = Math.min(255, Math.round(rgb[0] * s))
  const g = Math.min(255, Math.round(rgb[1] * s))
  const b = Math.min(255, Math.round(rgb[2] * s))
  return `rgb(${r},${g},${b})`
}

function faceNormal(pts: V3[]): V3 {
  return normalize(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
}

// ─── Katı cisim üreteçleri ────────────────────────────────────────────────

/** 4 taban köşesinden (dünya x,y) z0→z1 kutu */
function boxFaces(base: Point[], z0: number, z1: number, rgb: [number, number, number], out: Face[], layer: FaceLayer) {
  const b = base.map((p) => ({ x: p.x, y: p.y, z: z0 }))
  const t = base.map((p) => ({ x: p.x, y: p.y, z: z1 }))
  const quads: V3[][] = [
    [t[0], t[1], t[2], t[3]], // üst
    [b[3], b[2], b[1], b[0]], // alt
    [b[0], b[1], t[1], t[0]],
    [b[1], b[2], t[2], t[1]],
    [b[2], b[3], t[3], t[2]],
    [b[3], b[0], t[0], t[3]]
  ]
  for (const q of quads) out.push({ pts: q, color: shade(rgb, faceNormal(q)), layer })
}

/** Dikey (z ekseni) silindir */
function cylZFaces(cx: number, cy: number, z0: number, z1: number, r: number, rgb: [number, number, number], out: Face[], layer: FaceLayer, seg = 18) {
  const ring: Point[] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    ring.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    const q: V3[] = [
      { x: ring[i].x, y: ring[i].y, z: z0 },
      { x: ring[j].x, y: ring[j].y, z: z0 },
      { x: ring[j].x, y: ring[j].y, z: z1 },
      { x: ring[i].x, y: ring[i].y, z: z1 }
    ]
    out.push({ pts: q, color: shade(rgb, faceNormal(q)), layer })
  }
  // kapaklar
  const top: V3[] = ring.map((p) => ({ x: p.x, y: p.y, z: z1 }))
  const bot: V3[] = ring.map((p) => ({ x: p.x, y: p.y, z: z0 })).reverse()
  out.push({ pts: top, color: shade(rgb, { x: 0, y: 0, z: Math.sign(z1 - z0) || 1 }), layer })
  out.push({ pts: bot, color: shade(rgb, { x: 0, y: 0, z: -Math.sign(z1 - z0) || -1 }), layer })
}

/** Düz (yatay) çokgen yüzey — belirtilen z'de (pad/iz gibi) */
function flatFace(
  poly: Point[],
  z: number,
  rgb: [number, number, number],
  out: Face[],
  layer: FaceLayer,
  holes?: Point[][]
) {
  const pts: V3[] = poly.map((p) => ({ x: p.x, y: p.y, z }))
  const holePts = holes && holes.length > 0
    ? holes.filter((h) => h.length >= 3).map((h) => h.map((p) => ({ x: p.x, y: p.y, z })))
    : undefined
  out.push({ pts, color: shade(rgb, { x: 0, y: 0, z: 1 }), layer, holes: holePts })
}

// ─── Kart dilimi ──────────────────────────────────────────────────────────

/** Kart dış hattının kapalı poligon noktaları (dünya mm) */
function boardPolygon(project: Project): Point[] {
  const ed = boardEditablePolygon(project.board)
  return filletPolygon(ed.points, ed.radii, 8)
}

function buildBoard(project: Project, out: Face[]) {
  const poly = boardPolygon(project)
  if (poly.length < 3) return
  const maskRaw = project.board.color || '#1a5c2a'
  const mask = hexToRgb(maskRaw)
  const fr4: [number, number, number] = [176, 158, 108]
  // İç kesimler (delik/yuva) — hem üst hem alt yüzde gerçek boşluk (evenodd
  // ile delik) + aralarında FR4 renkli iç duvar, böylece gerçek bir oyuk/yuva
  // gibi görünür (her iki taraftan da bakılınca hole olarak görünür).
  const cutoutRings = (project.board.cutouts ?? [])
    .map((c) => {
      const pts = cutoutOutlinePoints(c)
      // cutoutOutlinePoints kapalı halka döndürür (son nokta = ilk nokta);
      // fazladan yinelenen nokta gerekmiyor, kırp
      if (pts.length > 1) {
        const a = pts[0]
        const b = pts[pts.length - 1]
        if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) pts.pop()
      }
      return pts
    })
    .filter((r) => r.length >= 3)
  // Üst yüz (lehim maskesi rengi)
  flatFace(poly, TOP_Z, mask, out, 'board', cutoutRings)
  // Alt yüz (biraz koyu) — AYNI kesim delikleriyle (iki taraftan da oyuk görünür)
  const dark = mask.map((c) => Math.round(c * 0.7)) as [number, number, number]
  flatFace([...poly].reverse(), BOT_Z, dark, out, 'board', cutoutRings)
  // Yan duvarlar (FR4) — kart dış hattı
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const q: V3[] = [
      { x: a.x, y: a.y, z: BOT_Z },
      { x: b.x, y: b.y, z: BOT_Z },
      { x: b.x, y: b.y, z: TOP_Z },
      { x: a.x, y: a.y, z: TOP_Z }
    ]
    out.push({ pts: q, color: shade(fr4, faceNormal(q)), layer: 'board' })
  }
  // İç duvarlar (FR4) — kesimlerin (cutout) iç yüzeyi, gerçek bir oyuk/yuva
  // gibi görünmesi için (ters sırada: normal deliğin içine, kesimin kendi
  // merkezine doğru baksın). Kesim kart kenarını taşarsa (tamamı kart
  // sınırları içinde değilse) duvar EKLENMEZ — aksi halde kartın dışında
  // boşlukta asılı bir "çerçeve" gibi görünürdü.
  for (const ring of cutoutRings) {
    if (!ring.every((p) => pointInPolygon(p, poly))) continue
    const rev = [...ring].reverse()
    for (let i = 0; i < rev.length; i++) {
      const a = rev[i]
      const b = rev[(i + 1) % rev.length]
      const q: V3[] = [
        { x: a.x, y: a.y, z: BOT_Z },
        { x: b.x, y: b.y, z: BOT_Z },
        { x: b.x, y: b.y, z: TOP_Z },
        { x: a.x, y: a.y, z: TOP_Z }
      ]
      out.push({ pts: q, color: shade(fr4, faceNormal(q)), layer: 'board' })
    }
  }
  // Montaj delikleri — her iki yüzde koyu disk (alttan bakınca da görünür)
  for (const h of project.board.mountingHoles) {
    out.push({ pts: disc(h.x, h.y, h.drill / 2, TOP_Z + 0.01), color: 'rgb(18,20,24)', layer: 'flat-top' })
    out.push({ pts: disc(h.x, h.y, h.drill / 2, BOT_Z - 0.01).reverse(), color: 'rgb(18,20,24)', layer: 'flat-bottom' })
  }
}

function disc(cx: number, cy: number, r: number, z: number, seg = 16): V3[] {
  const pts: V3[] = []
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z })
  }
  return pts
}

// ─── Bakır izler ──────────────────────────────────────────────────────────

function buildTraces(project: Project, out: Face[]) {
  // Lehim maskesi altındaki izler maske renginin biraz açığı olarak görünür
  const mask = hexToRgb(project.board.color || '#1a5c2a')
  const tint = mask.map((c) => Math.min(255, Math.round(c * 1.35 + 22))) as [number, number, number]
  for (const tr of project.traces) {
    const top = tr.layer === 'top'
    const z = top ? TOP_Z + 0.008 : BOT_Z - 0.008
    const layer: FaceLayer = top ? 'flat-top' : 'flat-bottom'
    const hw = tr.width / 2
    for (let i = 0; i < tr.points.length - 1; i++) {
      const a = tr.points[i]
      const b = tr.points[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l = Math.hypot(dx, dy) || 1
      const nx = (-dy / l) * hw
      const ny = (dx / l) * hw
      flatFace([
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny }
      ], z, tint, out, layer)
    }
  }
  // Via bakırları — her iki yüzde
  for (const v of project.vias) {
    out.push({ pts: disc(v.x, v.y, v.diameter / 2, TOP_Z + 0.01), color: 'rgb(212,175,55)', layer: 'flat-top' })
    out.push({ pts: disc(v.x, v.y, v.drill / 2, TOP_Z + 0.02), color: 'rgb(18,20,24)', layer: 'flat-top' })
    out.push({ pts: disc(v.x, v.y, v.diameter / 2, BOT_Z - 0.01).reverse(), color: 'rgb(212,175,55)', layer: 'flat-bottom' })
    out.push({ pts: disc(v.x, v.y, v.drill / 2, BOT_Z - 0.02).reverse(), color: 'rgb(18,20,24)', layer: 'flat-bottom' })
  }
}

// ─── Pad'ler (altın) ───────────────────────────────────────────────────────

function buildPads(comp: ComponentInstance, fp: Footprint, out: Face[]) {
  const gold: [number, number, number] = [212, 175, 55]
  const bottom = comp.side === 'bottom'
  const layer: FaceLayer = bottom ? 'flat-bottom' : 'flat-top'
  const otherLayer: FaceLayer = bottom ? 'flat-top' : 'flat-bottom'
  const dir = bottom ? -1 : 1
  const zNear = bottom ? BOT_Z - 0.01 : TOP_Z + 0.01
  const zFar = bottom ? TOP_Z + 0.01 : BOT_Z - 0.01
  const orient = (pts: V3[], up: boolean) => (up ? pts : [...pts].reverse())
  for (const pad of fp.pads) {
    if (pad.name.startsWith('MH')) {
      // montaj deliği pad'i — sadece delik
      const hpos = padDrillWorldPos(comp, pad)
      if (pad.drill) {
        out.push({ pts: orient(disc(hpos.x, hpos.y, pad.drill / 2, zNear + dir * 0.01), !bottom), color: 'rgb(18,20,24)', layer })
      }
      continue
    }
    const pos = padWorldPos(comp, pad)
    const { width, height } = padWorldSize(comp, pad)
    const hx = width / 2
    const hy = height / 2
    const rectPts = [
      { x: pos.x - hx, y: pos.y - hy },
      { x: pos.x + hx, y: pos.y - hy },
      { x: pos.x + hx, y: pos.y + hy },
      { x: pos.x - hx, y: pos.y + hy }
    ]
    const isTht = !!pad.drill || pad.layer === 'both'
    if (pad.shape === 'circle') {
      out.push({ pts: orient(disc(pos.x, pos.y, Math.max(hx, hy), zNear), !bottom), color: 'rgb(212,175,55)', layer })
      // THT pad karşı yüzde de görünür
      if (isTht) out.push({ pts: orient(disc(pos.x, pos.y, Math.max(hx, hy), zFar), bottom), color: 'rgb(212,175,55)', layer: otherLayer })
    } else {
      flatFace(bottom ? [...rectPts].reverse() : rectPts, zNear, gold, out, layer)
      if (isTht) flatFace(bottom ? rectPts : [...rectPts].reverse(), zFar, gold, out, otherLayer)
    }
    // delik (THT) — her iki yüzde koyu disk (pad merkezine göre kaymalı)
    if (pad.drill) {
      const hpos = padDrillWorldPos(comp, pad)
      out.push({ pts: orient(disc(hpos.x, hpos.y, pad.drill / 2, zNear + dir * 0.01), !bottom), color: 'rgb(18,20,24)', layer })
      out.push({ pts: orient(disc(hpos.x, hpos.y, pad.drill / 2, zFar - dir * 0.01), bottom), color: 'rgb(18,20,24)', layer: otherLayer })
    }
  }
}

const surfaceZ = (comp: ComponentInstance) => (comp.side === 'bottom' ? BOT_Z : TOP_Z)

// ─── Bileşen gövdeleri ──────────────────────────────────────────────────────

interface BodyStyle {
  shape: 'box' | 'cyl'
  color: [number, number, number]
  height: number
  /** konnektör pinleri / TO-220 tab gibi ek öğeler */
  extra?: 'connector' | 'tab' | 'button'
}

function bodyStyle(fp: Footprint): BodyStyle {
  const id = fp.id.toLowerCase()
  const name = (fp.name || '').toLowerCase()
  const cat = fp.category
  const has = (s: string) => id.includes(s) || name.includes(s)
  const isSmd = fp.pads.every((p) => !p.drill && p.layer !== 'both')
  const bodyMin = Math.min(fp.body.width, fp.body.height)

  // Modüller / geliştirme kartları / sensörler → koyu lacivert kart
  if (cat === 'Mikrodenetleyici' || cat === 'Motor Sürücü' || cat === 'Sensör & Modül') {
    if (has('wroom') || has('nrf')) return { shape: 'box', color: [40, 44, 52], height: 2.8 }
    return { shape: 'box', color: [22, 42, 74], height: 3.2 }
  }

  if (cat === 'Entegre (IC)') {
    return { shape: 'box', color: [26, 26, 28], height: isSmd ? 1.0 : 3.6 }
  }

  if (cat === 'Direnç') {
    if (has('pot') || has('trim')) return { shape: 'box', color: [30, 60, 130], height: 4.5 }
    if (isSmd) return { shape: 'box', color: [30, 30, 32], height: 0.55 }
    return { shape: 'box', color: [206, 180, 140], height: 2.4 } // eksenel gövde
  }

  if (cat === 'Kondansatör') {
    if (has('elec')) return { shape: 'cyl', color: [26, 30, 42], height: Math.max(5, bodyMin) }
    if (has('tant')) return { shape: 'box', color: [190, 150, 30], height: 1.9 }
    if (isSmd) return { shape: 'box', color: [150, 120, 70], height: 0.9 } // MLCC
    if (has('disc') || has('seramik')) return { shape: 'box', color: [40, 95, 150], height: 3.2 }
    return { shape: 'box', color: [40, 95, 150], height: 3 }
  }

  if (cat === 'Diyot & LED') {
    if (has('led')) {
      const col: [number, number, number] = [220, 40, 40]
      if (isSmd) return { shape: 'box', color: [230, 230, 235], height: 0.9 }
      return { shape: 'cyl', color: col, height: Math.max(3, bodyMin) }
    }
    if (isSmd) return { shape: 'box', color: [22, 22, 24], height: 1.0 }
    return { shape: 'box', color: [30, 30, 32], height: 2.0 } // eksenel diyot
  }

  if (cat === 'Transistör & Regülatör') {
    if (has('to92')) return { shape: 'cyl', color: [26, 26, 28], height: 4.2 }
    if (has('to220')) return { shape: 'box', color: [26, 26, 28], height: 4.5, extra: 'tab' }
    if (has('lm2596')) return { shape: 'box', color: [22, 42, 74], height: 3.2 }
    if (has('dpak') || has('d2pak') || has('to252') || has('to263')) return { shape: 'box', color: [26, 26, 28], height: 1.6, extra: 'tab' }
    return { shape: 'box', color: [24, 24, 26], height: 1.1 } // SOT
  }

  if (cat === 'Konnektör') {
    if (has('screw') || has('klemens')) return { shape: 'box', color: [30, 70, 150], height: 8 }
    if (has('barrel')) return { shape: 'box', color: [20, 20, 22], height: 11 }
    if (has('usb')) return { shape: 'box', color: [180, 184, 190], height: 3.2 }
    return { shape: 'box', color: [20, 20, 22], height: 2.6, extra: 'connector' }
  }

  if (cat === 'Buton & Mekanik') {
    if (has('buzzer')) return { shape: 'cyl', color: [18, 18, 20], height: 9 }
    if (has('relay') || has('röle')) return { shape: 'box', color: [40, 70, 150], height: 15 }
    if (has('crystal') || has('kristal')) return { shape: 'box', color: [180, 184, 190], height: 3.5 }
    if (has('tact')) return { shape: 'box', color: [20, 20, 22], height: 3.5, extra: 'button' }
    return { shape: 'box', color: [40, 40, 44], height: 3 }
  }

  return { shape: 'box', color: [40, 110, 70], height: 1.5 }
}

function bodyCorners(comp: ComponentInstance, fp: Footprint): Point[] {
  const b = fp.body
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height }
  ].map((p) => localToWorld(comp, p))
}

/**
 * Footprint'e bağlı özel mesh modelini (footprint editöründen içe aktarılmış)
 * komponent konumu/dönüşü/yüzüne göre dünya uzayına dönüştürüp ekler.
 */
function buildFootprintMesh(
  comp: ComponentInstance,
  m: NonNullable<Footprint['model3d']>,
  rgb: [number, number, number],
  out: Face[]
) {
  const V = m.verts!
  const T = m.tris!
  const s = m.scale ?? 1
  const mirror = comp.side === 'bottom'
  const dir = mirror ? -1 : 1
  const ownRad = (((m.rotZ ?? 0) * Math.PI) / 180) * (mirror ? -1 : 1)
  const compRad = ((comp.rotation * Math.PI) / 180)
  const cos1 = Math.cos(ownRad)
  const sin1 = Math.sin(ownRad)
  const cos2 = Math.cos(compRad)
  const sin2 = Math.sin(compRad)
  const baseZ = surfaceZ(comp) + dir * (m.z ?? 0)
  const tx = (vi: number): V3 => {
    // model kendi dönüşü + ölçek
    let lx = V[vi * 3] * s
    let ly = V[vi * 3 + 1] * s
    const lz = V[vi * 3 + 2] * s
    const rx = lx * cos1 - ly * sin1
    const ry = lx * sin1 + ly * cos1
    // alt yüz aynalama (localToWorld ile aynı kural)
    lx = mirror ? -rx : rx
    ly = ry
    // komponent dönüşü + konum
    return {
      x: comp.x + (lx * cos2 - ly * sin2),
      y: comp.y + (lx * sin2 + ly * cos2),
      z: baseZ + dir * lz
    }
  }
  const layer: FaceLayer = mirror ? 'body-bottom' : 'body-top'
  for (let i = 0; i + 2 < T.length; i += 3) {
    const a = tx(T[i])
    const b = tx(T[i + 1])
    const c = tx(T[i + 2])
    out.push({ pts: [a, b, c], color: shade(rgb, faceNormal([a, b, c])), layer })
  }
}

function buildComponent(comp: ComponentInstance, fp: Footprint, out: Face[]) {
  buildPads(comp, fp, out)
  const dir = comp.side === 'bottom' ? -1 : 1
  const z0 = surfaceZ(comp)
  const override = comp.color3d ? hexToRgb(comp.color3d) : null

  // Footprint'e atanmış özel 3B model (footprint editöründen)
  const fpm = fp.model3d
  if (fpm?.kind === 'mesh' && fpm.verts && fpm.tris && fpm.tris.length >= 3) {
    buildFootprintMesh(comp, fpm, override ?? hexToRgb(fpm.color || '#9aa4b2'), out)
    return
  }

  const auto = bodyStyle(fp)
  const st: BodyStyle =
    fpm?.kind === 'param'
      ? {
          shape: fpm.shape ?? auto.shape,
          color: override ?? (fpm.color ? hexToRgb(fpm.color) : auto.color),
          height: fpm.height ?? auto.height,
          extra: auto.extra
        }
      : { ...auto, color: override ?? auto.color }
  const z1 = z0 + dir * st.height
  const center = localToWorld(comp, {
    x: fp.body.x + fp.body.width / 2,
    y: fp.body.y + fp.body.height / 2
  })

  const bodyLayer: FaceLayer = comp.side === 'bottom' ? 'body-bottom' : 'body-top'
  if (st.shape === 'cyl') {
    const r = Math.min(fp.body.width, fp.body.height) / 2
    cylZFaces(center.x, center.y, z0 + dir * 0.1, z1, Math.max(0.4, r), st.color, out, bodyLayer)
  } else {
    boxFaces(bodyCorners(comp, fp), z0 + dir * 0.05, z1, st.color, out, bodyLayer)
  }

  // Ek öğeler
  if (st.extra === 'connector') {
    // pinleri altın küçük çubuklar olarak yukarı çıkar
    const gold: [number, number, number] = [212, 175, 55]
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      const pos = padWorldPos(comp, pad)
      const s = 0.5
      boxFaces([
        { x: pos.x - s, y: pos.y - s },
        { x: pos.x + s, y: pos.y - s },
        { x: pos.x + s, y: pos.y + s },
        { x: pos.x - s, y: pos.y + s }
      ], z0, z0 + dir * (st.height + 2.5), gold, out, bodyLayer)
    }
  } else if (st.extra === 'tab') {
    // metal soğutucu tab (gövdenin bir kenarında, gümüş)
    const silver: [number, number, number] = [172, 176, 182]
    const c = bodyCorners(comp, fp)
    // gövdenin üst kenarı boyunca ince bir şerit
    const a = c[0]
    const b = c[1]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const tw = Math.hypot(b.x - a.x, b.y - a.y) / 2
    const ux = (b.x - a.x) / (tw * 2)
    const uy = (b.y - a.y) / (tw * 2)
    // dikey ince plaka
    boxFaces([
      { x: mx - ux * tw, y: my - uy * tw },
      { x: mx + ux * tw, y: my + uy * tw },
      { x: mx + ux * tw - uy * 0.6, y: my + uy * tw + ux * 0.6 },
      { x: mx - ux * tw - uy * 0.6, y: my - uy * tw + ux * 0.6 }
    ], z0, z1 + dir * 1.5, silver, out, bodyLayer)
  } else if (st.extra === 'button') {
    // buton üstü (küçük silindir)
    cylZFaces(center.x, center.y, z1, z1 + dir * 1.2, Math.min(fp.body.width, fp.body.height) * 0.28, [40, 40, 44], out, bodyLayer)
  }
}

// ─── Sahne kurulumu + render ────────────────────────────────────────────────

/** İçe aktarılmış 3B modelleri (OBJ/STL) kart üzerine yerleştir */
function buildModels(project: Project, out: Face[]) {
  for (const m of project.models3d ?? []) {
    if (m.visible === false) continue
    const rgb = hexToRgb(m.color || '#9aa4b2')
    const s = m.scale || 1
    const rad = ((m.rotZ || 0) * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const baseZ = TOP_Z + (m.z || 0)
    const V = m.verts
    const T = m.tris
    const tx = (vi: number): V3 => {
      const lx = V[vi * 3] * s
      const ly = V[vi * 3 + 1] * s
      const lz = V[vi * 3 + 2] * s
      return { x: m.x + (lx * cos - ly * sin), y: m.y + (lx * sin + ly * cos), z: baseZ + lz }
    }
    for (let i = 0; i + 2 < T.length; i += 3) {
      const a = tx(T[i])
      const b = tx(T[i + 1])
      const c = tx(T[i + 2])
      out.push({ pts: [a, b, c], color: shade(rgb, faceNormal([a, b, c])), layer: 'body-top' })
    }
  }
}

/** Sahnenin tüm yüzeyleri — hem canlı çizim hem OBJ dışa aktarımı kullanır */
export function buildScene(s: Pick<Scene3DState, 'project' | 'getFootprint' | 'showComponents' | 'showTraces' | 'showModels'>): Face[] {
  const out: Face[] = []
  buildBoard(s.project, out)
  if (s.showTraces) buildTraces(s.project, out)
  if (s.showComponents) {
    for (const comp of s.project.components) {
      const fp = s.getFootprint(comp.footprintId)
      if (fp) buildComponent(comp, fp, out)
    }
  }
  if (s.showModels !== false) buildModels(s.project, out)
  return out
}

interface CamBasis {
  eye: V3
  right: V3
  up: V3
  forward: V3
  focal: number
}

function cameraBasis(cam: Camera, width: number, height: number): CamBasis {
  const cp = Math.cos(cam.pitch)
  const dir: V3 = {
    x: Math.cos(cam.yaw) * cp,
    y: Math.sin(cam.yaw) * cp,
    z: Math.sin(cam.pitch)
  }
  const eye: V3 = {
    x: cam.target.x - dir.x * cam.dist,
    y: cam.target.y - dir.y * cam.dist,
    z: cam.target.z - dir.z * cam.dist
  }
  const forward = normalize(sub(cam.target, eye))
  const worldUp: V3 = { x: 0, y: 0, z: 1 }
  // DİKKAT: 2B editör y-aşağı olduğundan (x-doğu, y-güney, z-yukarı) dünya
  // SOL-el takımıdır; sağ vektör worldUp × forward alınmalı. Aksi hâlde sahne
  // X ekseninde AYNALI görünür ve döndürme kontrolleri ters hissedilir.
  let right = normalize(cross(worldUp, forward))
  if (Math.hypot(right.x, right.y, right.z) < 0.5) right = { x: 1, y: 0, z: 0 }
  const up = normalize(cross(forward, right))
  const focal = height / (2 * Math.tan((45 * Math.PI) / 180 / 2))
  return { eye, right, up, forward, focal }
}

/** Ekrana sığdıran varsayılan kamera */
export function fit3DCamera(project: Project): Camera {
  const w = project.board.width
  const h = project.board.height
  return {
    yaw: -Math.PI / 2 - 0.5,
    pitch: -0.62,
    dist: Math.max(w, h) * 1.9 + 30,
    target: { x: w / 2, y: h / 2, z: 0 }
  }
}

/**
 * Ekran piksel noktasını (fare tıklaması) kart düzlemine (z=0) ışın
 * izdüşümü yaparak dünya (mm) noktasına çevirir — 3B görünümde tıklanan
 * nesneyi bulmak (seçim aracı) için kullanılır. Işın kameranın arkasına
 * gidiyorsa ya da düzleme neredeyse paralelse null döner.
 */
export function screenToBoardPoint(
  camera: Camera,
  width: number,
  height: number,
  sx: number,
  sy: number
): { point: Point; pixelToMm: number } | null {
  const basis = cameraBasis(camera, width, height)
  const dx = (sx - width / 2) / basis.focal
  const dy = -(sy - height / 2) / basis.focal
  const dir: V3 = {
    x: basis.right.x * dx + basis.up.x * dy + basis.forward.x,
    y: basis.right.y * dx + basis.up.y * dy + basis.forward.y,
    z: basis.right.z * dx + basis.up.z * dy + basis.forward.z
  }
  if (Math.abs(dir.z) < 1e-6) return null
  const t = -basis.eye.z / dir.z
  if (t <= 0.05) return null
  return {
    point: { x: basis.eye.x + dir.x * t, y: basis.eye.y + dir.y * t },
    pixelToMm: t / basis.focal
  }
}

export function render3D(ctx: CanvasRenderingContext2D, s: Scene3DState): void {
  const { width, height } = s
  // Arkaplan degrade
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, '#1b2430')
  g.addColorStop(1, '#0d1117')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  const faces = buildScene(s)
  const basis = cameraBasis(s.camera, width, height)
  const cx = width / 2
  const cy = height / 2

  interface Proj { sx: number; sy: number; depth: number }
  const projected: {
    face: Face
    screen: { x: number; y: number }[]
    depth: number
    holesScreen?: { x: number; y: number }[][]
  }[] = []

  const projectPoint = (p: V3): Proj | null => {
    const rel = sub(p, basis.eye)
    const camZ = dot(rel, basis.forward)
    if (camZ < 0.05) return null // kameranın arkasında
    const camX = dot(rel, basis.right)
    const camY = dot(rel, basis.up)
    return {
      sx: cx + (camX / camZ) * basis.focal,
      sy: cy - (camY / camZ) * basis.focal,
      depth: camZ
    }
  }

  for (const face of faces) {
    const screen: { x: number; y: number }[] = []
    let depthSum = 0
    let ok = true
    for (const p of face.pts) {
      const pr = projectPoint(p)
      if (!pr) { ok = false; break }
      screen.push({ x: pr.sx, y: pr.sy })
      depthSum += pr.depth
    }
    if (!ok || screen.length < 3) continue
    let holesScreen: { x: number; y: number }[][] | undefined
    if (face.holes && face.holes.length > 0) {
      holesScreen = []
      for (const hole of face.holes) {
        const hs: { x: number; y: number }[] = []
        let hok = true
        for (const p of hole) {
          const pr = projectPoint(p)
          if (!pr) { hok = false; break }
          hs.push({ x: pr.sx, y: pr.sy })
        }
        if (hok && hs.length >= 3) holesScreen.push(hs)
      }
    }
    projected.push({ face, screen, depth: depthSum / screen.length, holesScreen })
  }

  // Katmanlı ressam algoritması: önce kameraya göre UZAK taraftaki nesneler,
  // sonra kart, sonra yakın taraf (yüzey düzlemleri, sonra gövdeler). Böylece
  // pad'ler gövdenin içinden, gövdeler kartın arkasından "sızmaz".
  const eyeAbove = basis.eye.z >= 0
  const layerOrder: FaceLayer[] = eyeAbove
    ? ['flat-bottom', 'body-bottom', 'board', 'flat-top', 'body-top']
    : ['flat-top', 'body-top', 'board', 'flat-bottom', 'body-bottom']
  const layerRank = new Map(layerOrder.map((l, i) => [l, i]))
  projected.sort((a, b) => {
    const ra = layerRank.get(a.face.layer)! - layerRank.get(b.face.layer)!
    if (ra !== 0) return ra
    return b.depth - a.depth // grup içinde uzaktan yakına
  })

  for (const { face, screen, holesScreen } of projected) {
    const hasHoles = !!holesScreen && holesScreen.length > 0
    if (hasHoles) ctx.save()
    ctx.beginPath()
    ctx.moveTo(screen[0].x, screen[0].y)
    for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y)
    ctx.closePath()
    if (hasHoles) {
      // Kesim (cutout) kart dış hattından ta\u015farsa bile ta\u015fan k\u0131s\u0131m
      // doldurulmas\u0131n diye \u00f6nce kart\u0131n d\u0131\u015f hatt\u0131na kliple; sadece kart
      // s\u0131n\u0131rlar\u0131 i\u00e7indeki delik ge\u00e7erli olur.
      ctx.clip()
      for (const hole of holesScreen!) {
        ctx.moveTo(hole[0].x, hole[0].y)
        for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y)
        ctx.closePath()
      }
    }
    ctx.fillStyle = face.color
    ctx.fill(hasHoles ? 'evenodd' : 'nonzero')
    // ince kenar — cisim ayrımını netleştir
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 0.5
    ctx.stroke()
    if (hasHoles) ctx.restore()
  }

  // ── Silkscreen yazıları (PCB'ye eklenen metinler) ──
  // Kart opak bir dilim olduğundan, yalnızca kameraya bakan yüzdeki yazılar
  // gösterilir; karşı yüzdeki yazı kartın arkasında kalır (görünmez).
  for (const txt of s.project.texts) {
    const bottom = txt.layer === 'bottom-silk'
    if (bottom === eyeAbove) continue // kartın arkasındaki yüz — opak kart tarafından gizlenir
    const { strokes, strokeWidth } = placeText(
      txt.text, txt, txt.size, txt.rotation, bottom, 'center', { font: txt.font }
    )
    const z = bottom ? BOT_Z - 0.01 : TOP_Z + 0.01
    ctx.strokeStyle = bottom ? '#c9d6e3' : '#e8f2ff'
    ctx.lineCap = 'round'
    for (const poly of strokes) {
      const pts = poly.map((p) => projectPoint({ x: p.x, y: p.y, z }))
      if (pts.some((p) => !p)) continue
      const scr = pts as Proj[]
      const lw = Math.max(1, (strokeWidth * (txt.bold ? 1.9 : 1) * basis.focal) / scr[0].depth)
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(scr[0].sx, scr[0].sy)
      for (const p of scr.slice(1)) ctx.lineTo(p.sx, p.sy)
      ctx.stroke()
    }
  }

  // ── Silkscreen görselleri (logo/işaret olarak eklenen PNG/SVG'ler) ──
  // Yalnızca eklendikleri katmanda (üst/alt) ve kart yüzeyine bitişik, düz
  // (2B) olarak gösterilir — 3B'de kabartma/hacim OLUŞTURULMAZ.
  for (const im of s.project.images) {
    const bottom = im.layer === 'bottom-silk'
    if (bottom === eyeAbove) continue // kartın arkasındaki yüz — opak kart tarafından gizlenir
    const img = getCachedImage(im.src, s.onImageLoad ?? (() => {}))
    if (!img) continue
    const z = bottom ? BOT_Z - 0.01 : TOP_Z + 0.01
    const cx = im.x + im.width / 2
    const cy = im.y + im.height / 2
    const hw = im.width / 2
    const hh = im.height / 2
    const corner = (lx: number, ly: number): Point => {
      const m = im.mirror ? { x: -lx, y: ly } : { x: lx, y: ly }
      const r = rotatePoint(m, im.rotation)
      return { x: r.x + cx, y: r.y + cy }
    }
    const p00 = projectPoint({ ...corner(-hw, -hh), z })
    const p10 = projectPoint({ ...corner(hw, -hh), z })
    const p01 = projectPoint({ ...corner(-hw, hh), z })
    if (!p00 || !p10 || !p01) continue
    const a = (p10.sx - p00.sx) / im.width
    const b = (p10.sy - p00.sy) / im.width
    const c = (p01.sx - p00.sx) / im.height
    const d = (p01.sy - p00.sy) / im.height
    ctx.save()
    ctx.transform(a, b, c, d, p00.sx, p00.sy)
    ctx.globalAlpha = im.opacity ?? 1
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, 0, 0, im.width, im.height)
    ctx.restore()
  }

  // ── Footprint 3B model yazı etiketleri (model3d.labels) ──
  // Kart silk yazılarıyla AYNI teknik: vektör harf konturları nokta nokta
  // projekte edilir (bkz. yukarıdaki "Silkscreen yazıları"), böylece gerçek
  // 3B perspektifle doğru görünür — bozulma/kayma olmaz, kamerayı döndürmek
  // yalnızca doğal ölçek/açı foreshortening yapar (metin modele yapışık kalır).
  for (const comp of s.project.components) {
    const fp = s.getFootprint(comp.footprintId)
    const labels = fp?.model3d?.labels
    if (!labels || labels.length === 0) continue
    const bottom = comp.side === 'bottom'
    if (bottom === eyeAbove) continue // karşı yüzdeki bileşen kartın arkasında kalır
    const dir = bottom ? -1 : 1
    const compRad = (comp.rotation * Math.PI) / 180
    const cos2 = Math.cos(compRad)
    const sin2 = Math.sin(compRad)
    const baseZ = surfaceZ(comp)
    for (const lbl of labels) {
      const size = lbl.size ?? 1.2
      const z = baseZ + dir * (lbl.z ?? 0.3)
      const rot = ((lbl.rotZ ?? 0) * Math.PI) / 180
      const cosL = Math.cos(rot)
      const sinL = Math.sin(rot)
      const { strokes, strokeWidth } = placeText(lbl.text, { x: 0, y: 0 }, size, 0, false, 'center', {})
      ctx.strokeStyle = lbl.color || '#ffffff'
      ctx.lineCap = 'round'
      for (const poly of strokes) {
        const scr: Proj[] = []
        let ok = true
        for (const p of poly) {
          // 1) etiketin kendi dönüşü (serbest açı, yerel/aynalanmamış uzayda)
          const rx = p.x * cosL - p.y * sinL
          const ry = p.x * sinL + p.y * cosL
          // 2) etiket konumu, ardından komponentin mirror+rotate+translate
          // dönüşümü (localToWorld ile aynı sıra — bkz. transformArcAngles)
          const lx = lbl.x + rx
          const ly = lbl.y + ry
          const mx = bottom ? -lx : lx
          const my = ly
          const wx = comp.x + (mx * cos2 - my * sin2)
          const wy = comp.y + (mx * sin2 + my * cos2)
          const pr = projectPoint({ x: wx, y: wy, z })
          if (!pr) { ok = false; break }
          scr.push(pr)
        }
        if (!ok || scr.length < 2) continue
        ctx.lineWidth = Math.max(1, (strokeWidth * basis.focal) / scr[0].depth)
        ctx.beginPath()
        ctx.moveTo(scr[0].sx, scr[0].sy)
        for (const p of scr.slice(1)) ctx.lineTo(p.sx, p.sy)
        ctx.stroke()
      }
    }
  }

  // ── Pin adı etiketleri (isteğe bağlı) — kaplama olarak her zaman üstte ──
  if (s.showPinLabels) {
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const drawn: { x: number; y: number; w: number; h: number }[] = []
    for (const comp of s.project.components) {
      const fp = s.getFootprint(comp.footprintId)
      if (!fp) continue
      for (const pad of fp.pads) {
        if (pad.name.startsWith('MH')) continue
        const pos = padWorldPos(comp, pad)
        const z = comp.side === 'bottom' ? BOT_Z - 0.4 : TOP_Z + 0.4
        const pr = projectPoint({ x: pos.x, y: pos.y, z })
        if (!pr) continue
        const w = ctx.measureText(pad.name).width + 6
        const h = 13
        const rect = { x: pr.sx, y: pr.sy, w, h }
        // çok yoğun bölgelerde üst üste binenleri atla
        if (
          drawn.some(
            (d) =>
              Math.abs(d.x - rect.x) * 2 < d.w + rect.w &&
              Math.abs(d.y - rect.y) * 2 < d.h + rect.h
          )
        ) {
          continue
        }
        drawn.push(rect)
        ctx.fillStyle = 'rgba(10,12,16,0.72)'
        ctx.fillRect(pr.sx - w / 2, pr.sy - h / 2, w, h)
        ctx.fillStyle = '#e8f2ff'
        ctx.fillText(pad.name, pr.sx, pr.sy)
      }
    }
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  // ── Seçim vurgusu — seçili bileşenlerin etrafına parlak çerçeve ──
  if (s.selectedComponentIds && s.selectedComponentIds.length > 0) {
    const selectedSet = new Set(s.selectedComponentIds)
    ctx.strokeStyle = '#3fd3dc'
    ctx.lineWidth = 2
    for (const comp of s.project.components) {
      if (!selectedSet.has(comp.id)) continue
      const fp = s.getFootprint(comp.footprintId)
      if (!fp) continue
      const bb = componentBBox(comp, fp)
      const z = comp.side === 'bottom' ? BOT_Z - 0.35 : TOP_Z + 0.35
      const corners = [
        { x: bb.x, y: bb.y },
        { x: bb.x + bb.width, y: bb.y },
        { x: bb.x + bb.width, y: bb.y + bb.height },
        { x: bb.x, y: bb.y + bb.height }
      ].map((p) => projectPoint({ x: p.x, y: p.y, z }))
      if (corners.some((p) => !p)) continue
      const scr = corners as Proj[]
      ctx.beginPath()
      ctx.moveTo(scr[0].sx, scr[0].sy)
      for (const p of scr.slice(1)) ctx.lineTo(p.sx, p.sy)
      ctx.closePath()
      ctx.stroke()
    }
  }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [26, 92, 42]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
