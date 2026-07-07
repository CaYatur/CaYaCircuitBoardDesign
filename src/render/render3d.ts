// ─── 3B (Üç Boyutlu) Render Motoru ────────────────────────────────────────
// Bağımlılıksız, Canvas 2D tabanlı basit bir 3B sahne çizici. Kartı bir dilim
// (slab) olarak, bileşenleri kategoriye göre kutu/silindir katı cisimler olarak
// üretir; yüzeyleri kamera uzayına dönüştürüp derinliğe göre sıralar (ressam
// algoritması) ve sabit ışıkla gölgeleyerek çizer. Amaç: gerçekçi bir önizleme.

import type { ComponentInstance, Footprint, PadDef, Point, Project } from '../types'
import { localToWorld, padWorldPos, padWorldSize } from '../core/geometry'
import { boardEditablePolygon, filletPolygon } from '../core/boardGeometry'

export interface V3 { x: number; y: number; z: number }

/** Işıkla önceden gölgelenmiş, dünya uzayında düz (convex) çokgen yüzey */
interface Face {
  pts: V3[]
  color: string
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
function boxFaces(base: Point[], z0: number, z1: number, rgb: [number, number, number], out: Face[]) {
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
  for (const q of quads) out.push({ pts: q, color: shade(rgb, faceNormal(q)) })
}

/** Dikey (z ekseni) silindir */
function cylZFaces(cx: number, cy: number, z0: number, z1: number, r: number, rgb: [number, number, number], out: Face[], seg = 18) {
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
    out.push({ pts: q, color: shade(rgb, faceNormal(q)) })
  }
  // kapaklar
  const top: V3[] = ring.map((p) => ({ x: p.x, y: p.y, z: z1 }))
  const bot: V3[] = ring.map((p) => ({ x: p.x, y: p.y, z: z0 })).reverse()
  out.push({ pts: top, color: shade(rgb, { x: 0, y: 0, z: Math.sign(z1 - z0) || 1 }) })
  out.push({ pts: bot, color: shade(rgb, { x: 0, y: 0, z: -Math.sign(z1 - z0) || -1 }) })
}

/** Düz (yatay) çokgen yüzey — belirtilen z'de (pad/iz gibi) */
function flatFace(poly: Point[], z: number, rgb: [number, number, number], out: Face[]) {
  const pts: V3[] = poly.map((p) => ({ x: p.x, y: p.y, z }))
  out.push({ pts, color: shade(rgb, { x: 0, y: 0, z: 1 }) })
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
  // Üst yüz (lehim maskesi rengi)
  flatFace(poly, TOP_Z, mask, out)
  // Alt yüz (biraz koyu)
  const dark = mask.map((c) => Math.round(c * 0.7)) as [number, number, number]
  flatFace([...poly].reverse(), BOT_Z, dark, out)
  // Yan duvarlar (FR4)
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const q: V3[] = [
      { x: a.x, y: a.y, z: BOT_Z },
      { x: b.x, y: b.y, z: BOT_Z },
      { x: b.x, y: b.y, z: TOP_Z },
      { x: a.x, y: a.y, z: TOP_Z }
    ]
    out.push({ pts: q, color: shade(fr4, faceNormal(q)) })
  }
  // Montaj delikleri — üst yüzde koyu disk
  for (const h of project.board.mountingHoles) {
    out.push({ pts: disc(h.x, h.y, h.drill / 2, TOP_Z + 0.01), color: 'rgb(18,20,24)' })
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
    const z = tr.layer === 'top' ? TOP_Z + 0.008 : BOT_Z - 0.008
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
      ], z, tint, out)
    }
  }
  // Via bakırları
  for (const v of project.vias) {
    out.push({ pts: disc(v.x, v.y, v.diameter / 2, TOP_Z + 0.01), color: 'rgb(212,175,55)' })
    out.push({ pts: disc(v.x, v.y, v.drill / 2, TOP_Z + 0.02), color: 'rgb(18,20,24)' })
  }
}

// ─── Pad'ler (altın) ───────────────────────────────────────────────────────

function buildPads(comp: ComponentInstance, fp: Footprint, out: Face[]) {
  const gold: [number, number, number] = [212, 175, 55]
  for (const pad of fp.pads) {
    if (pad.name.startsWith('MH')) {
      // montaj deliği pad'i — sadece delik
      const pos = padWorldPos(comp, pad)
      if (pad.drill) out.push({ pts: disc(pos.x, pos.y, pad.drill / 2, surfaceZ(comp) + 0.02), color: 'rgb(18,20,24)' })
      continue
    }
    const pos = padWorldPos(comp, pad)
    const { width, height } = padWorldSize(comp, pad)
    const zTop = comp.side === 'bottom' ? BOT_Z - 0.01 : TOP_Z + 0.01
    const hx = width / 2
    const hy = height / 2
    if (pad.shape === 'circle') {
      out.push({ pts: disc(pos.x, pos.y, Math.max(hx, hy), zTop), color: 'rgb(212,175,55)' })
    } else {
      flatFace([
        { x: pos.x - hx, y: pos.y - hy },
        { x: pos.x + hx, y: pos.y - hy },
        { x: pos.x + hx, y: pos.y + hy },
        { x: pos.x - hx, y: pos.y + hy }
      ], zTop, gold, out)
    }
    // delik (THT)
    if (pad.drill) {
      out.push({ pts: disc(pos.x, pos.y, pad.drill / 2, zTop + 0.01), color: 'rgb(18,20,24)' })
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

function buildComponent(comp: ComponentInstance, fp: Footprint, out: Face[]) {
  buildPads(comp, fp, out)
  const st = bodyStyle(fp)
  const dir = comp.side === 'bottom' ? -1 : 1
  const z0 = surfaceZ(comp)
  const z1 = z0 + dir * st.height
  const center = localToWorld(comp, {
    x: fp.body.x + fp.body.width / 2,
    y: fp.body.y + fp.body.height / 2
  })

  if (st.shape === 'cyl') {
    const r = Math.min(fp.body.width, fp.body.height) / 2
    cylZFaces(center.x, center.y, z0 + dir * 0.1, z1, Math.max(0.4, r), st.color, out)
  } else {
    boxFaces(bodyCorners(comp, fp), z0 + dir * 0.05, z1, st.color, out)
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
      ], z0, z0 + dir * (st.height + 2.5), gold, out)
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
    ], z0, z1 + dir * 1.5, silver, out)
  } else if (st.extra === 'button') {
    // buton üstü (küçük silindir)
    cylZFaces(center.x, center.y, z1, z1 + dir * 1.2, Math.min(fp.body.width, fp.body.height) * 0.28, [40, 40, 44], out)
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
      out.push({ pts: [a, b, c], color: shade(rgb, faceNormal([a, b, c])) })
    }
  }
}

function buildScene(s: Scene3DState): Face[] {
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
  let right = normalize(cross(forward, worldUp))
  if (!isFinite(right.x)) right = { x: 1, y: 0, z: 0 }
  const up = normalize(cross(right, forward))
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
  const projected: { face: Face; screen: { x: number; y: number }[]; depth: number }[] = []

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
    projected.push({ face, screen, depth: depthSum / screen.length })
  }

  // Ressam algoritması: uzaktan yakına
  projected.sort((a, b) => b.depth - a.depth)

  for (const { face, screen } of projected) {
    ctx.beginPath()
    ctx.moveTo(screen[0].x, screen[0].y)
    for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y)
    ctx.closePath()
    ctx.fillStyle = face.color
    ctx.fill()
    // ince kenar — cisim ayrımını netleştir
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [26, 92, 42]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
