// ─── İsabet testi ─────────────────────────────────────────────────────────
// İmleç altındaki nesneyi bulur. Öncelik: pad > via > komponent gövdesi >
// iz > yazı > bakır alan.

import type { Footprint, Point, Project } from '../types'
import {
  capsulesTouch,
  circleCapsule,
  componentBBox,
  hitTrace,
  padCapsule,
  padWorldPos,
  pointInRect
} from '../core/geometry'
import { textWidth } from '../render/vectorFont'

export type HitResult =
  | { type: 'pad'; componentId: string; padName: string; center: Point; net: string }
  | { type: 'via'; id: string }
  | { type: 'component'; id: string }
  | { type: 'trace'; id: string }
  | { type: 'text'; id: string }
  | { type: 'zone'; id: string }
  | { type: 'image'; id: string }
  | null

export function hitTest(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  p: Point,
  tol: number
): HitResult {
  // Pad'ler
  const pad = findPadAt(project, getFootprint, p, tol)
  if (pad) return pad

  // Vialar
  for (const via of project.vias) {
    if (Math.hypot(p.x - via.x, p.y - via.y) <= via.diameter / 2 + tol) {
      return { type: 'via', id: via.id }
    }
  }

  // Komponent gövdeleri
  for (let i = project.components.length - 1; i >= 0; i--) {
    const comp = project.components[i]
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    if (pointInRect(p, componentBBox(comp, fp))) {
      return { type: 'component', id: comp.id }
    }
  }

  // İzler
  for (let i = project.traces.length - 1; i >= 0; i--) {
    const t = project.traces[i]
    if (hitTrace(p, t.points, t.width, tol)) {
      return { type: 'trace', id: t.id }
    }
  }

  // Yazılar (gerçek stroke-font genişliğiyle)
  for (const t of project.texts) {
    const w = textWidth(t.text, t.size, t.font)
    const vertical = t.rotation === 90 || t.rotation === 270
    const halfW = (vertical ? t.size : w) / 2 + tol
    const halfH = (vertical ? w : t.size) / 2 + tol
    if (
      p.x >= t.x - halfW && p.x <= t.x + halfW &&
      p.y >= t.y - halfH && p.y <= t.y + halfH
    ) {
      return { type: 'text', id: t.id }
    }
  }

  // Bakır alanlar
  for (const z of project.zones) {
    if (pointInRect(p, { x: z.x, y: z.y, width: z.width, height: z.height })) {
      return { type: 'zone', id: z.id }
    }
  }

  // Görseller (döndürme dikkate alınarak — en düşük öncelik)
  for (let i = project.images.length - 1; i >= 0; i--) {
    const im = project.images[i]
    const cx = im.x + im.width / 2
    const cy = im.y + im.height / 2
    let dx = p.x - cx
    let dy = p.y - cy
    if (im.rotation) {
      const a = (-im.rotation * Math.PI) / 180
      const rx = dx * Math.cos(a) - dy * Math.sin(a)
      const ry = dx * Math.sin(a) + dy * Math.cos(a)
      dx = rx
      dy = ry
    }
    if (Math.abs(dx) <= im.width / 2 + tol && Math.abs(dy) <= im.height / 2 + tol) {
      return { type: 'image', id: im.id }
    }
  }

  return null
}

/** İmlecin altındaki pad'i bul (iz çizimi / net atama için) */
export function findPadAt(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  p: Point,
  tol: number
): Extract<HitResult, { type: 'pad' }> | null {
  const cursor = circleCapsule(p.x, p.y, tol)
  for (let i = project.components.length - 1; i >= 0; i--) {
    const comp = project.components[i]
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (capsulesTouch(padCapsule(comp, pad), cursor)) {
        return {
          type: 'pad',
          componentId: comp.id,
          padName: pad.name,
          center: padWorldPos(comp, pad),
          net: comp.padNets[pad.name] ?? ''
        }
      }
    }
  }
  return null
}
