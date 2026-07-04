// ─── Şematik modeli ───────────────────────────────────────────────────────
// Komponentler footprint pinlerinden otomatik kutu sembolü olarak üretilir.
// Teller pin uçlarına bağlanır; bağlantı grupları net adlarına çevrilip
// PCB tarafındaki padNets alanına senkronize edilir (ratsnest/otorouter
// doğrudan bu netleri kullanır).

import type {
  Footprint,
  Point,
  Project,
  Rotation,
  SchematicSymbol
} from '../types'
import { uid } from '../types'
import { rotatePoint, segPointDist } from '../core/geometry'

/** Şematik ızgara adımı */
export const SCH_GRID = 2.54

export interface SymbolPin {
  name: string
  /** Tel bağlantı ucu (sembol yerel koordinatı) */
  end: Point
  /** Kutu kenarındaki iç nokta */
  inner: Point
  side: 'left' | 'right'
}

export interface SymbolLayout {
  /** Kutu (yerel koordinatlar) */
  box: { x: number; y: number; width: number; height: number }
  pins: SymbolPin[]
}

/**
 * Footprint'ten sembol yerleşimi üret. Yerel orijin: sol üst pin ucu.
 * Pinler sola/sağa bölünür; tüm pin uçları SCH_GRID katlarında kalır.
 */
export function symbolLayout(fp: Footprint): SymbolLayout {
  const pads = fp.pads.filter((p) => !p.name.startsWith('MH'))
  const n = pads.length
  const leftCount = Math.ceil(n / 2)
  const rows = Math.max(leftCount, n - leftCount, 1)

  // Kutu genişliği: en uzun pin adı çiftine göre, ızgara katı
  const maxNameLen = Math.max(2, ...pads.map((p) => p.name.length))
  const rawWidth = Math.min(16, maxNameLen) * 1.5 * 2 + 4
  const boxW = Math.ceil(rawWidth / SCH_GRID) * SCH_GRID

  const pins: SymbolPin[] = []
  pads.forEach((pad, i) => {
    const isLeft = i < leftCount
    const row = isLeft ? i : i - leftCount
    const y = row * SCH_GRID
    if (isLeft) {
      pins.push({
        name: pad.name,
        end: { x: 0, y },
        inner: { x: SCH_GRID, y },
        side: 'left'
      })
    } else {
      pins.push({
        name: pad.name,
        end: { x: boxW + 2 * SCH_GRID, y },
        inner: { x: boxW + SCH_GRID, y },
        side: 'right'
      })
    }
  })

  return {
    box: {
      x: SCH_GRID,
      y: -SCH_GRID,
      width: boxW,
      height: (rows + 1) * SCH_GRID
    },
    pins
  }
}

/** Sembol yerel koordinatını şematik dünya koordinatına çevir */
export function symbolToWorld(sym: SchematicSymbol, p: Point): Point {
  const r = rotatePoint(p, sym.rotation)
  return { x: r.x + sym.x, y: r.y + sym.y }
}

/** Sembolün dünya koordinatlarında sınır kutusu */
export function symbolBBox(
  sym: SchematicSymbol,
  layout: SymbolLayout
): { x: number; y: number; width: number; height: number } {
  const corners: Point[] = [
    { x: 0, y: layout.box.y },
    { x: layout.box.x + layout.box.width + SCH_GRID, y: layout.box.y },
    {
      x: layout.box.x + layout.box.width + SCH_GRID,
      y: layout.box.y + layout.box.height
    },
    { x: 0, y: layout.box.y + layout.box.height }
  ].map((p) => symbolToWorld(sym, p))
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  }
}

/** Eksik sembolleri oluştur (yeni komponentler şemada belirsin) */
export function ensureSymbols(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): boolean {
  let changed = false
  const existing = new Set(project.schematic.symbols.map((s) => s.componentId))
  // Silinen komponentlerin sembollerini temizle
  const compIds = new Set(project.components.map((c) => c.id))
  const before = project.schematic.symbols.length
  project.schematic.symbols = project.schematic.symbols.filter((s) =>
    compIds.has(s.componentId)
  )
  if (project.schematic.symbols.length !== before) changed = true

  // Yeni komponentleri ızgara düzeninde yerleştir
  let cursor = { x: SCH_GRID * 4, y: SCH_GRID * 4 }
  let rowMaxH = 0
  for (const comp of project.components) {
    if (existing.has(comp.id)) {
      // Var olanların konumuna göre imleci ilerletme (kaba yaklaşım)
      continue
    }
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    const layout = symbolLayout(fp)
    const w = layout.box.width + 4 * SCH_GRID
    const h = layout.box.height + 4 * SCH_GRID
    if (cursor.x + w > 400) {
      cursor = { x: SCH_GRID * 4, y: cursor.y + rowMaxH }
      rowMaxH = 0
    }
    // Boş alan bul: mevcut sembollerle çakışmayı kabaca önle
    while (
      project.schematic.symbols.some(
        (s) =>
          Math.abs(s.x - cursor.x) < w && Math.abs(s.y - cursor.y) < h
      )
    ) {
      cursor.x += w
      if (cursor.x > 400) {
        cursor = { x: SCH_GRID * 4, y: cursor.y + Math.max(h, rowMaxH) }
      }
    }
    project.schematic.symbols.push({
      componentId: comp.id,
      x: cursor.x,
      y: cursor.y,
      rotation: 0
    })
    cursor.x += w
    rowMaxH = Math.max(rowMaxH, h)
    changed = true
  }
  return changed
}

// ─── Net senkronizasyonu ──────────────────────────────────────────────────

interface PinRef {
  componentId: string
  padName: string
  pos: Point
}

const near = (a: Point, b: Point, tol = 0.01): boolean =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol

/** Nokta tel üzerinde mi? (uç veya segment üzeri) */
function pointOnWire(p: Point, points: Point[], tol = 0.01): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (segPointDist(points[i], points[i + 1], p) <= tol) return true
  }
  return false
}

/**
 * Şematikteki telleri analiz edip PCB net atamalarını günceller.
 * - Tel gruplarına ad: açık verilmiş wire.net > mevcut pin neti > N$k
 * - Tellere bağlı pinlerin padNets alanı yazılır
 * - Tele bağlı olmayan pinlerin elle atanmış netlerine dokunulmaz
 */
export function syncSchematicNets(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): void {
  const wires = project.schematic.wires
  const nWires = wires.length
  if (nWires === 0) return

  // Tel-tel bağlantı grupları (union-find)
  const parent = Array.from({ length: nWires }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < nWires; i++) {
    for (let j = i + 1; j < nWires; j++) {
      const a = wires[i]
      const b = wires[j]
      const touches =
        a.points.some((p) => pointOnWire(p, b.points)) ||
        b.points.some((p) => pointOnWire(p, a.points))
      if (touches) union(i, j)
    }
  }

  // Pin uçları
  const pins: PinRef[] = []
  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    const layout = symbolLayout(fp)
    for (const pin of layout.pins) {
      pins.push({
        componentId: comp.id,
        padName: pin.name,
        pos: symbolToWorld(sym, pin.end)
      })
    }
  }

  // Her pin hangi tel grubuna bağlı?
  const groupPins = new Map<number, PinRef[]>()
  for (const pin of pins) {
    for (let i = 0; i < nWires; i++) {
      if (
        wires[i].points.some((p) => near(p, pin.pos)) ||
        pointOnWire(pin.pos, wires[i].points)
      ) {
        const g = find(i)
        if (!groupPins.has(g)) groupPins.set(g, [])
        groupPins.get(g)!.push(pin)
        break
      }
    }
  }

  // Grup adları
  let autoCounter = 1
  const usedAuto = new Set<string>()
  const groupName = new Map<number, string>()
  const groups = [...new Set(Array.from({ length: nWires }, (_, i) => find(i)))]
  for (const g of groups) {
    // 1) Açık tel adı
    const explicit = wires
      .filter((_, i) => find(i) === g)
      .map((w) => w.net)
      .filter(Boolean)
      .sort()
    if (explicit.length > 0) {
      groupName.set(g, explicit[0])
      continue
    }
    // 2) Bağlı pinlerde önceden atanmış net (GND, VCC gibi elle verilenler)
    const memberPins = groupPins.get(g) ?? []
    const existing = memberPins
      .map((pin) => {
        const comp = project.components.find((c) => c.id === pin.componentId)
        return comp?.padNets[pin.padName] ?? ''
      })
      .filter((n) => n && !/^N\$\d+$/.test(n))
      .sort()
    if (existing.length > 0) {
      groupName.set(g, existing[0])
      continue
    }
    groupName.set(g, '') // sonradan otomatik ad
  }
  for (const g of groups) {
    if (!groupName.get(g)) {
      let name = `N$${autoCounter++}`
      while (usedAuto.has(name)) name = `N$${autoCounter++}`
      groupName.set(g, name)
    }
    usedAuto.add(groupName.get(g)!)
  }

  // Pinlere yaz
  for (const [g, memberPins] of groupPins) {
    const name = groupName.get(g)!
    for (const pin of memberPins) {
      const comp = project.components.find((c) => c.id === pin.componentId)
      if (comp) comp.padNets[pin.padName] = name
    }
  }
}

/** Tel çizim yardımcıları */
export const snapSch = (p: Point): Point => ({
  x: Math.round(p.x / SCH_GRID) * SCH_GRID,
  y: Math.round(p.y / SCH_GRID) * SCH_GRID
})

/** İki nokta arasında ortogonal (L şeklinde) ara nokta üret */
export function orthoCorner(from: Point, to: Point): Point | null {
  if (Math.abs(from.x - to.x) < 0.01 || Math.abs(from.y - to.y) < 0.01) {
    return null // zaten hizalı
  }
  // Baskın eksene göre köşe
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
    return { x: to.x, y: from.y }
  }
  return { x: from.x, y: to.y }
}

/** Kavşak noktaları: ≥3 tel ucunun buluştuğu yerler (render için) */
export function junctionPoints(wires: { points: Point[] }[]): Point[] {
  const counts = new Map<string, { p: Point; n: number }>()
  const key = (p: Point) => `${Math.round(p.x * 100)}_${Math.round(p.y * 100)}`
  for (const w of wires) {
    for (const p of [w.points[0], w.points[w.points.length - 1]]) {
      const k = key(p)
      const e = counts.get(k)
      if (e) e.n++
      else counts.set(k, { p, n: 1 })
    }
    // Uç, başka telin ortasına değiyorsa da kavşaktır
  }
  const junctions: Point[] = []
  for (const { p, n } of counts.values()) {
    if (n >= 3) junctions.push(p)
    else if (n >= 1) {
      // Uç başka bir telin segmenti üzerinde mi?
      let touches = 0
      for (const w of wires) {
        if (pointOnWire(p, w.points)) touches++
      }
      if (touches >= 2) junctions.push(p)
    }
  }
  return junctions
}
