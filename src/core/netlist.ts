// ─── Netlist / bağlantı analizi ───────────────────────────────────────────
// Karttaki tüm bakır nesneleri geometrik temaslarına göre gruplar (union-find),
// net atamalarını çözer, eksik bağlantılar için ratsnest (hava telleri) üretir
// ve kısa devreleri saptar.

import type { ComponentInstance, CopperLayer, Footprint, Project } from '../types'
import type { Point } from '../types'
import {
  Capsule,
  capsuleGap,
  capsulesTouch,
  capsuleRectGap,
  circleCapsule,
  dist,
  padCapsule,
  padCopperLayers,
  padWorldPos,
  pointInRect
} from './geometry'

export interface CopperItem {
  kind: 'pad' | 'trace' | 'via' | 'zone'
  /** Sahip nesnenin kimliği (komponent/trace/via/zone id) */
  ownerId: string
  /** Trace için segment indeksi */
  segIndex?: number
  padName?: string
  layers: CopperLayer[]
  capsule?: Capsule
  zoneRect?: { x: number; y: number; width: number; height: number }
  /** Kullanıcının atadığı net ('' = atanmamış) */
  assignedNet: string
  x: number
  y: number
}

export interface Airwire {
  x1: number
  y1: number
  x2: number
  y2: number
  net: string
}

export interface ShortCircuit {
  /**
   * 'net'       = bir bağlantı grubunda birden çok adlandırılmış net
   * 'trace-pad' = bir iz, ucu olmadığı bir pad'in üzerinden geçiyor (kayma vb.)
   * 'pad-pad'   = farklı komponentlerin pad'leri fiziksel çakışıyor
   */
  kind: 'net' | 'trace-pad' | 'pad-pad'
  nets: string[]
  /** İlgili nesne referansları (ör. "U1.3", "R2") — mesaj biçimlemede kullanılır */
  refs?: string[]
  x: number
  y: number
}

export interface NetAnalysis {
  items: CopperItem[]
  /** items ile aynı sırada: her öğenin bağlantı grubu kimliği */
  groupOf: number[]
  /** Her öğe için çözülmüş net adı ('' = bilinmiyor) */
  resolvedNet: string[]
  airwires: Airwire[]
  shorts: ShortCircuit[]
  /** Projedeki tüm adlandırılmış netler */
  netNames: string[]
}

class UnionFind {
  parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

const layersOverlap = (a: CopperLayer[], b: CopperLayer[]): boolean =>
  a.some((l) => b.includes(l))

/** Projedeki tüm bakır öğeleri düz listeye dönüştürür */
export function buildCopperItems(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): CopperItem[] {
  const items: CopperItem[] = []

  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      const pos = padWorldPos(comp, pad)
      items.push({
        kind: 'pad',
        ownerId: comp.id,
        padName: pad.name,
        layers: padCopperLayers(comp, pad),
        capsule: padCapsule(comp, pad),
        assignedNet: comp.padNets[pad.name] ?? '',
        x: pos.x,
        y: pos.y
      })
    }
  }

  for (const trace of project.traces) {
    for (let i = 0; i < trace.points.length - 1; i++) {
      const a = trace.points[i]
      const b = trace.points[i + 1]
      items.push({
        kind: 'trace',
        ownerId: trace.id,
        segIndex: i,
        layers: [trace.layer],
        capsule: { x1: a.x, y1: a.y, x2: b.x, y2: b.y, r: trace.width / 2 },
        assignedNet: trace.net,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      })
    }
  }

  for (const via of project.vias) {
    items.push({
      kind: 'via',
      ownerId: via.id,
      layers: ['top', 'bottom'],
      capsule: circleCapsule(via.x, via.y, via.diameter / 2),
      assignedNet: via.net,
      x: via.x,
      y: via.y
    })
  }

  for (const zone of project.zones) {
    items.push({
      kind: 'zone',
      ownerId: zone.id,
      layers: [zone.layer],
      zoneRect: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      assignedNet: zone.net,
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 2
    })
  }

  return items
}

/** İki bakır öğe geometrik olarak temas ediyor mu? */
function itemsTouch(a: CopperItem, b: CopperItem): boolean {
  if (!layersOverlap(a.layers, b.layers)) return false
  if (a.capsule && b.capsule) return capsulesTouch(a.capsule, b.capsule)
  // Zone temasları: zone yalnızca kendi netindeki öğelere bağlanır
  // (render/export sırasında diğer netlerin çevresi boşaltılır)
  const zone = a.zoneRect ? a : b
  const other = a.zoneRect ? b : a
  if (!zone.zoneRect) return false
  if (zone.assignedNet === '' || zone.assignedNet !== (other.assignedNet || zone.assignedNet)) {
    // Net ataması uyuşmuyorsa fiziksel temas kabul edilmez (boşluk açılır)
    if (other.assignedNet !== '' && other.assignedNet !== zone.assignedNet) return false
  }
  if (!other.capsule) {
    // zone-zone: dikdörtgen kesişimi
    if (!b.zoneRect || !a.zoneRect) return false
    return (
      a.zoneRect.x < b.zoneRect.x + b.zoneRect.width &&
      a.zoneRect.x + a.zoneRect.width > b.zoneRect.x &&
      a.zoneRect.y < b.zoneRect.y + b.zoneRect.height &&
      a.zoneRect.y + a.zoneRect.height > b.zoneRect.y
    )
  }
  // Yalnızca aynı nete atanmış öğeler zone'a bağlanır
  if (other.assignedNet !== zone.assignedNet) return false
  return (
    capsuleRectGap(other.capsule, zone.zoneRect) <= 1e-3 ||
    pointInRect({ x: other.x, y: other.y }, zone.zoneRect)
  )
}

/** Tam bağlantı analizi */
export function analyzeNets(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): NetAnalysis {
  const items = buildCopperItems(project, getFootprint)
  const n = items.length
  const uf = new UnionFind(n)

  // Kaba uzamsal filtre: sınır kutusu çakışmayanları atla
  const bounds = items.map((it) => {
    if (it.zoneRect) {
      return {
        minX: it.zoneRect.x, minY: it.zoneRect.y,
        maxX: it.zoneRect.x + it.zoneRect.width,
        maxY: it.zoneRect.y + it.zoneRect.height
      }
    }
    const c = it.capsule!
    return {
      minX: Math.min(c.x1, c.x2) - c.r, minY: Math.min(c.y1, c.y2) - c.r,
      maxX: Math.max(c.x1, c.x2) + c.r, maxY: Math.max(c.y1, c.y2) + c.r
    }
  })

  // Uzamsal hash ile aday çiftleri üret (O(n²) yerine ~O(n)).
  forEachCandidatePair(bounds, (i, j) => {
    if (uf.find(i) === uf.find(j)) return
    const bi = bounds[i]
    const bj = bounds[j]
    if (bi.minX > bj.maxX + 0.01 || bj.minX > bi.maxX + 0.01 ||
        bi.minY > bj.maxY + 0.01 || bj.minY > bi.maxY + 0.01) return
    if (itemsTouch(items[i], items[j])) uf.union(i, j)
  })

  const groupOf = items.map((_, i) => uf.find(i))

  // Her grup için net çözümü: gruptaki adlandırılmış netler
  const groupNets = new Map<number, Set<string>>()
  for (let i = 0; i < n; i++) {
    if (items[i].assignedNet) {
      let set = groupNets.get(groupOf[i])
      if (!set) {
        set = new Set()
        groupNets.set(groupOf[i], set)
      }
      set.add(items[i].assignedNet)
    }
  }

  const resolvedNet = items.map((it, i) => {
    const set = groupNets.get(groupOf[i])
    if (set && set.size === 1) return [...set][0]
    return it.assignedNet
  })

  // Kısa devreler
  const shorts: ShortCircuit[] = []
  // 1) Bir bağlantı grubunda birden çok adlandırılmış net
  for (const [group, set] of groupNets) {
    if (set.size > 1) {
      const member = items[groupOf.findIndex((g) => g === group)]
      shorts.push({ kind: 'net', nets: [...set].sort(), x: member.x, y: member.y })
    }
  }
  // 2) Fiziksel kısa devreler: iz bir pad'in üzerinden geçiyor / pad'ler çakışıyor.
  //    (Adlandırılmamış netlerde bile kayma sonucu oluşan temaslar yakalanır.)
  shorts.push(...detectPhysicalShorts(project, getFootprint))

  // Ratsnest: her adlandırılmış net için bağlantısız pad gruplarını
  // en yakın çiftlerle birleştir (açgözlü MST)
  const netNames = new Set<string>()
  for (const it of items) if (it.assignedNet) netNames.add(it.assignedNet)

  const airwires: Airwire[] = []
  for (const net of netNames) {
    const padIdx = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.kind === 'pad' && it.assignedNet === net)
    if (padIdx.length < 2) continue

    // Pad'leri bağlantı grubuna göre kümele
    const clusters = new Map<number, { i: number }[]>()
    for (const { i } of padIdx) {
      const g = groupOf[i]
      if (!clusters.has(g)) clusters.set(g, [])
      clusters.get(g)!.push({ i })
    }
    const clusterList = [...clusters.values()]
    // Açgözlü birleştirme: kalan kümeler arasında en yakın pad çiftini bul
    while (clusterList.length > 1) {
      let best = { d: Infinity, a: 0, b: 1, pa: 0, pb: 0 }
      for (let a = 0; a < clusterList.length; a++) {
        for (let b = a + 1; b < clusterList.length; b++) {
          for (const pa of clusterList[a]) {
            for (const pb of clusterList[b]) {
              const d = Math.hypot(
                items[pa.i].x - items[pb.i].x,
                items[pa.i].y - items[pb.i].y
              )
              if (d < best.d) best = { d, a, b, pa: pa.i, pb: pb.i }
            }
          }
        }
      }
      airwires.push({
        x1: items[best.pa].x,
        y1: items[best.pa].y,
        x2: items[best.pb].x,
        y2: items[best.pb].y,
        net
      })
      clusterList[best.a].push(...clusterList[best.b])
      clusterList.splice(best.b, 1)
    }
  }

  return {
    items,
    groupOf,
    resolvedNet,
    airwires,
    shorts,
    netNames: [...netNames].sort()
  }
}

// ─── Uzamsal hash: aday çift üreteci ──────────────────────────────────────

interface Bound {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Sınır kutularını uniform bir ızgaraya kovalar; yalnız aynı hücreyi paylaşan
 * (yani yakın) öğe çiftlerini `cb`'ye verir. Çok geniş öğeler (tüm karta yayılan
 * zone gibi) "büyük" listeye alınıp herkesle sınanır. Böylece tipik dağılımda
 * çift sayısı ~O(n) olur.
 */
function forEachCandidatePair(
  bounds: Bound[],
  cb: (i: number, j: number) => void
): void {
  const n = bounds.length
  if (n < 2) return

  // Hücre boyutu: ortalama öğe genişliğine göre, makul aralıkta.
  let sum = 0
  for (const b of bounds) sum += (b.maxX - b.minX) + (b.maxY - b.minY)
  const avg = sum / (2 * n)
  const cell = Math.min(30, Math.max(2, avg * 1.5 || 5))

  const LARGE_CELLS = 256
  const grid = new Map<number, number[]>()
  const large: number[] = []
  const keyOf = (cx: number, cy: number) => cx * 73856093 + cy * 19349663

  for (let i = 0; i < n; i++) {
    const b = bounds[i]
    const cx0 = Math.floor(b.minX / cell)
    const cy0 = Math.floor(b.minY / cell)
    const cx1 = Math.floor(b.maxX / cell)
    const cy1 = Math.floor(b.maxY / cell)
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > LARGE_CELLS) {
      large.push(i)
      continue
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = keyOf(cx, cy)
        let arr = grid.get(k)
        if (!arr) grid.set(k, (arr = []))
        arr.push(i)
      }
    }
  }

  const seen = new Set<number>()
  const consider = (a: number, b: number) => {
    const i = a < b ? a : b
    const j = a < b ? b : a
    if (i === j) return
    const key = i * n + j
    if (seen.has(key)) return
    seen.add(key)
    cb(i, j)
  }

  for (const arr of grid.values()) {
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) consider(arr[a], arr[b])
    }
  }
  // Büyük öğeler herkesle
  for (const l of large) {
    for (let k = 0; k < n; k++) if (k !== l) consider(l, k)
  }
}

// ─── Fiziksel kısa devre saptama ──────────────────────────────────────────

interface PadInfo {
  componentId: string
  refDes: string
  padName: string
  net: string
  center: Point
  capsule: Capsule
  layers: CopperLayer[]
  /** Uç-oturma yarıçapı (pad'in yarı boyutu) */
  termR: number
  bound: Bound
}

/**
 * Ucu olmadığı bir pad'in üzerinden geçen izleri ve farklı komponentlerin
 * çakışan pad'lerini kısa devre olarak bildirir. Aynı (boş olmayan) nete
 * ait bilinçli temaslar elenir; yanlış pozitif en aza indirilir.
 */
function detectPhysicalShorts(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): ShortCircuit[] {
  const out: ShortCircuit[] = []
  const pads: PadInfo[] = []
  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      const cap = padCapsule(comp, pad)
      const center = padWorldPos(comp, pad)
      const termR = Math.max(pad.width, pad.height) / 2
      pads.push({
        componentId: comp.id,
        refDes: comp.refDes,
        padName: pad.name,
        net: comp.padNets[pad.name] ?? '',
        center,
        capsule: cap,
        layers: padCopperLayers(comp, pad),
        termR,
        bound: {
          minX: Math.min(cap.x1, cap.x2) - cap.r,
          minY: Math.min(cap.y1, cap.y2) - cap.r,
          maxX: Math.max(cap.x1, cap.x2) + cap.r,
          maxY: Math.max(cap.y1, cap.y2) + cap.r
        }
      })
    }
  }

  const boundsOverlap = (a: Bound, b: Bound) =>
    !(a.minX > b.maxX + 0.01 || b.minX > a.maxX + 0.01 ||
      a.minY > b.maxY + 0.01 || b.minY > a.maxY + 0.01)

  // A) İz bir pad'in üzerinden geçiyor (o pad izin ucu değil)
  for (const trace of project.traces) {
    if (trace.points.length < 2) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of trace.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const half = trace.width / 2
    const tb: Bound = { minX: minX - half, minY: minY - half, maxX: maxX + half, maxY: maxY + half }
    const first = trace.points[0]
    const last = trace.points[trace.points.length - 1]
    for (const pad of pads) {
      if (!pad.layers.includes(trace.layer)) continue
      if (!boundsOverlap(tb, pad.bound)) continue
      // İzin bir ucu bu pad'de mi sonlanıyor? (meşru bağlantı)
      const termTol = pad.termR + half
      if (dist(first, pad.center) <= termTol || dist(last, pad.center) <= termTol) continue
      // İzin gövdesi pad bakırıyla örtüşüyor mu?
      let crosses = false
      for (let i = 0; i < trace.points.length - 1 && !crosses; i++) {
        const seg: Capsule = {
          x1: trace.points[i].x, y1: trace.points[i].y,
          x2: trace.points[i + 1].x, y2: trace.points[i + 1].y, r: half
        }
        if (capsuleGap(seg, pad.capsule) <= 1e-3) crosses = true
      }
      if (!crosses) continue
      // Aynı (boş olmayan) net ise bilinçli — atla
      if (pad.net && trace.net && pad.net === trace.net) continue
      out.push({
        kind: 'trace-pad',
        nets: [trace.net || '', pad.net || ''].filter((v, i, a) => a.indexOf(v) === i),
        refs: [`${pad.refDes}.${pad.padName}`],
        x: pad.center.x,
        y: pad.center.y
      })
    }
  }

  // B) Farklı komponentlerin pad'leri çakışıyor
  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      const a = pads[i]
      const b = pads[j]
      if (a.componentId === b.componentId) continue
      if (!layersOverlap(a.layers, b.layers)) continue
      if (!boundsOverlap(a.bound, b.bound)) continue
      if (a.net && b.net && a.net === b.net) continue // aynı net — kasıtlı
      if (capsuleGap(a.capsule, b.capsule) <= -1e-3) {
        out.push({
          kind: 'pad-pad',
          nets: [a.net || '', b.net || ''].filter((v, k, arr) => arr.indexOf(v) === k),
          refs: [`${a.refDes}.${a.padName}`, `${b.refDes}.${b.padName}`],
          x: (a.center.x + b.center.x) / 2,
          y: (a.center.y + b.center.y) / 2
        })
      }
    }
  }

  return out
}

/** Bir komponentin pad'ine dokunulduğunda o pad'in netini bul */
export function findPadNet(
  comp: ComponentInstance,
  padName: string
): string {
  return comp.padNets[padName] ?? ''
}
