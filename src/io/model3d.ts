// ─── 3B Model içe aktarma (OBJ / STL) ─────────────────────────────────────
// Bağımlılıksız hafif ayrıştırıcılar. OBJ (metin) ve STL (ikili + ASCII)
// desteklenir; sonuç, 3B görünümün ressam-algoritması çizicisine beslenen
// düz üçgen listesidir (verts + tris).

import type { BoardOutline, FootprintModel3D, Model3D } from '../types'
import { uid } from '../types'

export interface Mesh {
  /** x,y,z üçlüleri düz dizi */
  verts: number[]
  /** üçgen köşe indeksleri (i0,i1,i2,...) */
  tris: number[]
}

/** OBJ metnini ayrıştır (v + f; çokgen yüzler yelpaze ile üçgenlenir) */
export function parseOBJ(text: string): Mesh {
  const verts: number[] = []
  const tris: number[] = []
  const lines = text.split('\n')
  for (const raw of lines) {
    const s = raw.trim()
    if (s.length < 2) continue
    if (s[0] === 'v' && (s[1] === ' ' || s[1] === '\t')) {
      const p = s.split(/\s+/)
      verts.push(parseFloat(p[1]) || 0, parseFloat(p[2]) || 0, parseFloat(p[3]) || 0)
    } else if (s[0] === 'f' && (s[1] === ' ' || s[1] === '\t')) {
      const toks = s.split(/\s+/).slice(1)
      const vcount = verts.length / 3
      const idx = toks.map((tok) => {
        const i = parseInt(tok.split('/')[0], 10)
        return i < 0 ? vcount + i : i - 1
      })
      for (let i = 1; i + 1 < idx.length; i++) {
        if (idx[0] >= 0 && idx[i] >= 0 && idx[i + 1] >= 0) {
          tris.push(idx[0], idx[i], idx[i + 1])
        }
      }
    }
  }
  return { verts, tris }
}

/** İkili STL ayrıştır */
function parseStlBinary(buf: ArrayBuffer): Mesh {
  const dv = new DataView(buf)
  const n = dv.getUint32(80, true)
  const verts: number[] = []
  const tris: number[] = []
  let off = 84
  const maxN = Math.min(n, Math.floor((buf.byteLength - 84) / 50))
  for (let i = 0; i < maxN; i++) {
    off += 12 // normal atla
    const base = verts.length / 3
    for (let v = 0; v < 3; v++) {
      verts.push(dv.getFloat32(off, true), dv.getFloat32(off + 4, true), dv.getFloat32(off + 8, true))
      off += 12
    }
    off += 2 // öznitelik
    tris.push(base, base + 1, base + 2)
  }
  return { verts, tris }
}

/** ASCII STL ayrıştır */
function parseStlAscii(text: string): Mesh {
  const verts: number[] = []
  const tris: number[] = []
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g
  const vs: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) vs.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]))
  for (let i = 0; i + 8 < vs.length; i += 9) {
    const base = verts.length / 3
    for (let k = 0; k < 9; k++) verts.push(vs[i + k])
    tris.push(base, base + 1, base + 2)
  }
  return { verts, tris }
}

/** STL — ikili mi ASCII mi otomatik algıla */
export function parseSTL(buf: ArrayBuffer): Mesh {
  const headLen = Math.min(512, buf.byteLength)
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, headLen))
  if (/^\s*solid/i.test(head) && /facet/i.test(head)) {
    return parseStlAscii(new TextDecoder().decode(new Uint8Array(buf)))
  }
  return parseStlBinary(buf)
}

/** Ağı XY'de merkezle ve tabanını (minZ) 0'a taşı; boyutlarını döndür */
function normalizeMesh(mesh: Mesh): { size: { x: number; y: number; z: number }; maxDim: number } {
  const v = mesh.verts
  if (v.length < 3) return { size: { x: 1, y: 1, z: 1 }, maxDim: 1 }
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < v.length; i += 3) {
    minX = Math.min(minX, v[i]); maxX = Math.max(maxX, v[i])
    minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1])
    minZ = Math.min(minZ, v[i + 2]); maxZ = Math.max(maxZ, v[i + 2])
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  for (let i = 0; i < v.length; i += 3) {
    v[i] -= cx
    v[i + 1] -= cy
    v[i + 2] -= minZ
  }
  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }
  return { size, maxDim: Math.max(size.x, size.y, size.z) || 1 }
}

/** Bir dosyadan Model3D üret (kart boyutuna göre makul varsayılan ölçek/konum) */
export async function loadModelFromFile(
  file: File,
  board: BoardOutline
): Promise<Model3D> {
  const nameLower = file.name.toLowerCase()
  let mesh: Mesh
  if (nameLower.endsWith('.obj')) {
    mesh = parseOBJ(await file.text())
  } else if (nameLower.endsWith('.stl')) {
    mesh = parseSTL(await file.arrayBuffer())
  } else {
    // İçeriğe göre dene
    const buf = await file.arrayBuffer()
    const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)))
    mesh = /^\s*(v |#|o |g |mtllib)/i.test(head)
      ? parseOBJ(new TextDecoder().decode(new Uint8Array(buf)))
      : parseSTL(buf)
  }
  if (mesh.tris.length === 0) {
    throw new Error('Model boş veya desteklenmeyen biçim (OBJ/STL bekleniyor)')
  }
  const { maxDim } = normalizeMesh(mesh)
  // Makul başlangıç ölçeği: en büyük boyut ~ kartın kısa kenarının yarısı
  const target = Math.max(6, Math.min(board.width, board.height) * 0.4)
  const scale = +(target / maxDim).toFixed(4)
  return {
    id: uid('m3d'),
    name: file.name.replace(/\.(obj|stl)$/i, ''),
    verts: mesh.verts,
    tris: mesh.tris,
    x: board.width / 2,
    y: board.height / 2,
    z: 0,
    rotZ: 0,
    scale,
    color: '#9aa4b2',
    visible: true
  }
}

/**
 * Bir dosyadan footprint 3B modeli üret (footprint editörü). Mesh XY'de
 * merkezlenir, tabanı z=0'a oturur; başlangıç ölçeği gövde boyutuna uydurulur.
 */
export async function loadFootprintMeshFromFile(
  file: File,
  body: { width: number; height: number }
): Promise<FootprintModel3D> {
  const nameLower = file.name.toLowerCase()
  let mesh: Mesh
  if (nameLower.endsWith('.obj')) {
    mesh = parseOBJ(await file.text())
  } else if (nameLower.endsWith('.stl')) {
    mesh = parseSTL(await file.arrayBuffer())
  } else {
    const buf = await file.arrayBuffer()
    const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)))
    mesh = /^\s*(v |#|o |g |mtllib)/i.test(head)
      ? parseOBJ(new TextDecoder().decode(new Uint8Array(buf)))
      : parseSTL(buf)
  }
  if (mesh.tris.length === 0) {
    throw new Error('Model boş veya desteklenmeyen biçim (OBJ/STL bekleniyor)')
  }
  const { size } = normalizeMesh(mesh)
  const maxXY = Math.max(size.x, size.y) || 1
  const target = Math.max(1, Math.max(body.width, body.height))
  const scale = +(target / maxXY).toFixed(4)
  return {
    kind: 'mesh',
    verts: mesh.verts,
    tris: mesh.tris,
    scale,
    rotZ: 0,
    z: 0,
    color: '#9aa4b2',
    name: file.name.replace(/\.(obj|stl)$/i, '')
  }
}

/** Dosya seçtir (OBJ/STL) */
export function pickModelFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.obj,.stl'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
