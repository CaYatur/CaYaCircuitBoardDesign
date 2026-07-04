// ─── Bağlantı takibi (rubber-band) ────────────────────────────────────────
// Bir komponent/via/iz taşınırken ona bağlı iz uçları ve teller aynı vektörle
// kaydırılır; böylece bağlantı kopmaz. Taşıma bittiğinde etkilenen izler az
// bozmayla toparlanır (gereksiz/eşdoğrusal noktalar temizlenir).

import type {
  ConnectionFollowSettings,
  Footprint,
  Point,
  Project
} from '../types'
import { circleCapsule, capsuleGap, dist, padCapsule, padWorldPos, type Capsule } from './geometry'

/** Taşımayla birlikte hareket edecek iz köşe noktaları ve vialar */
export interface FollowPlan {
  /** traceId → o iz üzerinde delta ile kayacak nokta indeksleri */
  traceEdits: Map<string, number[]>
  /** delta ile kayacak via kimlikleri */
  viaIds: string[]
}

interface Anchor {
  center: Point
  capsule: Capsule
}

/**
 * Taşınan nesnelerin "bağlantı noktalarını" (pad merkezleri, via merkezleri,
 * seçili iz uçları) toplar ve bunlara değen (ama kendisi taşınmayan) iz
 * köşe noktalarını / viaları belirler.
 */
export function planFollow(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  movedComponentIds: Set<string>,
  movedViaIds: Set<string>,
  movedTraceIds: Set<string>,
  cf: ConnectionFollowSettings
): FollowPlan {
  const plan: FollowPlan = { traceEdits: new Map(), viaIds: [] }
  if (!cf.enabled) return plan

  const anchors: Anchor[] = []

  // Taşınan komponentlerin pad'leri
  for (const comp of project.components) {
    if (!movedComponentIds.has(comp.id)) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      anchors.push({ center: padWorldPos(comp, pad), capsule: padCapsule(comp, pad) })
    }
  }

  // Taşınan vialar
  for (const via of project.vias) {
    if (!movedViaIds.has(via.id)) continue
    anchors.push({
      center: { x: via.x, y: via.y },
      capsule: circleCapsule(via.x, via.y, via.diameter / 2)
    })
  }

  // Taşınan izlerin uçları (iz-iz bağlantısı için)
  for (const tr of project.traces) {
    if (!movedTraceIds.has(tr.id)) continue
    for (const idx of [0, tr.points.length - 1]) {
      const p = tr.points[idx]
      anchors.push({ center: p, capsule: circleCapsule(p.x, p.y, tr.width / 2) })
    }
  }

  if (anchors.length === 0) return plan

  const tol = Math.max(0.001, cf.tolerance)
  const point = circleCapsule(0, 0, 0)

  const follows = (p: Point): boolean => {
    for (const a of anchors) {
      if (dist(p, a.center) <= tol) return true
    }
    if (cf.scope === 'all') {
      point.x1 = point.x2 = p.x
      point.y1 = point.y2 = p.y
      for (const a of anchors) {
        if (capsuleGap(point, a.capsule) <= tol) return true
      }
    }
    return false
  }

  // İz köşe noktaları
  for (const tr of project.traces) {
    if (movedTraceIds.has(tr.id)) continue
    const indices: number[] = []
    if (cf.scope === 'all') {
      for (let i = 0; i < tr.points.length; i++) {
        if (follows(tr.points[i])) indices.push(i)
      }
    } else {
      const last = tr.points.length - 1
      if (follows(tr.points[0])) indices.push(0)
      if (last !== 0 && follows(tr.points[last])) indices.push(last)
    }
    if (indices.length > 0) plan.traceEdits.set(tr.id, indices)
  }

  // Vialar (pad'e oturanlar)
  if (cf.dragVias) {
    for (const via of project.vias) {
      if (movedViaIds.has(via.id)) continue
      if (follows({ x: via.x, y: via.y })) plan.viaIds.push(via.id)
    }
  }

  return plan
}

const EPS = 1e-4

/** İki nokta pratikte aynı mı? */
const samePoint = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS

/** b, a→c doğrusu üzerinde mi (eşdoğrusal)? */
function collinear(a: Point, b: Point, c: Point): boolean {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return Math.abs(cross) < EPS
}

/**
 * Bir izi az bozmayla toparlar: ardışık tekrar eden noktaları ve eşdoğrusal
 * ara noktaları kaldırır. Yol topolojisini korur (yeniden rotalamaz).
 */
export function tidyTrace(points: Point[]): Point[] {
  if (points.length <= 2) return points
  // 1) Tekrar eden ardışık noktaları at
  const dedup: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    if (!samePoint(points[i], dedup[dedup.length - 1])) dedup.push(points[i])
  }
  if (dedup.length <= 2) return dedup
  // 2) Eşdoğrusal ara noktaları at
  const out: Point[] = [dedup[0]]
  for (let i = 1; i < dedup.length - 1; i++) {
    if (!collinear(out[out.length - 1], dedup[i], dedup[i + 1])) out.push(dedup[i])
  }
  out.push(dedup[dedup.length - 1])
  return out
}
