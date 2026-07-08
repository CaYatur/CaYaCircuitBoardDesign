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
import { padWorldPos, rotatePoint, segPointDist } from '../core/geometry'

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
  // Kullanıcının footprint editöründe tasarladığı özel sembol varsa onu kullan:
  // pin uçları tanımdan gelir; iç nokta, yönüne göre bir ızgara içeridedir.
  if (fp.symbol && fp.symbol.pins.length > 0) {
    const sPins: SymbolPin[] = fp.symbol.pins.map((p) => ({
      name: p.name,
      end: { x: p.x, y: p.y },
      inner: { x: p.x + (p.side === 'left' ? SCH_GRID : -SCH_GRID), y: p.y },
      side: p.side
    }))
    let box = fp.symbol.box
    if (!box) {
      const xs = sPins.map((p) => p.inner.x)
      const ys = sPins.map((p) => p.inner.y)
      for (const pr of fp.symbol.prims) {
        if (pr.k === 'line') { xs.push(pr.x1, pr.x2); ys.push(pr.y1, pr.y2) }
        else if (pr.k === 'poly') { for (const q of pr.pts) { xs.push(q.x); ys.push(q.y) } }
        else if (pr.k === 'circle' || pr.k === 'arc') { xs.push(pr.cx - pr.r, pr.cx + pr.r); ys.push(pr.cy - pr.r, pr.cy + pr.r) }
        else if (pr.k === 'plusminus' || pr.k === 'text') { xs.push(pr.x); ys.push(pr.y) }
      }
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      box = { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
    }
    return { box, pins: sPins }
  }
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
  // DİKKAT: nWires === 0 olsa bile devam edilir — son tel silindiğinde
  // aşağıdaki provenans temizliği bayat pin atamalarını kaldırmalıdır.

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

  // Her pin hangi tel(ler)e değiyor? Aynı pine değen ama birbirine değmeyen
  // teller de o pin üzerinden elektriksel olarak bağlıdır → gruplar birleşir.
  const pinTouches: number[][] = pins.map((pin) => {
    const touching: number[] = []
    for (let i = 0; i < nWires; i++) {
      if (
        wires[i].points.some((p) => near(p, pin.pos)) ||
        pointOnWire(pin.pos, wires[i].points)
      ) {
        touching.push(i)
      }
    }
    return touching
  })
  for (const touching of pinTouches) {
    for (let k = 1; k < touching.length; k++) union(touching[0], touching[k])
  }
  // Birleşimler bittikten SONRA pinleri gruplara ata (kökler değişmiş olabilir)
  const groupPins = new Map<number, PinRef[]>()
  pins.forEach((pin, pi) => {
    const touching = pinTouches[pi]
    if (touching.length === 0) return
    const g = find(touching[0])
    if (!groupPins.has(g)) groupPins.set(g, [])
    groupPins.get(g)!.push(pin)
  })

  // Grup adları
  let autoCounter = 1
  const usedAuto = new Set<string>()
  const groupName = new Map<number, string>()
  const groups = [...new Set(Array.from({ length: nWires }, (_, i) => find(i)))]
  const pendingAuto: number[] = []
  for (const g of groups) {
    // 1) Açık tel adı (kullanıcının verdiği)
    const explicit = wires
      .filter((_, i) => find(i) === g)
      .map((w) => w.net)
      .filter(Boolean)
      .sort()
    if (explicit.length > 0) {
      groupName.set(g, explicit[0])
      continue
    }
    // Bağlı pinlerde önceden atanmış netleri say
    const memberPins = groupPins.get(g) ?? []
    const netCounts = new Map<string, number>()
    for (const pin of memberPins) {
      const comp = project.components.find((c) => c.id === pin.componentId)
      const n = comp?.padNets[pin.padName] ?? ''
      if (n) netCounts.set(n, (netCounts.get(n) ?? 0) + 1)
    }
    // 2) Elle verilmiş (N$ olmayan) ad — GND, VCC vb.
    const named = [...netCounts.keys()].filter((n) => !/^N\$\d+$/.test(n)).sort()
    if (named.length > 0) {
      groupName.set(g, named[0])
      continue
    }
    // 3) Mevcut otomatik adı KORU (kararlılık) — böylece ilgisiz bir düzenleme
    //    netleri yeniden numaralamaz, PCB izleri yanlışlıkla "eski" sayılmaz.
    const autos = [...netCounts.entries()]
      .filter(([n]) => /^N\$\d+$/.test(n) && !usedAuto.has(n))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (autos.length > 0) {
      groupName.set(g, autos[0][0])
      usedAuto.add(autos[0][0])
      continue
    }
    pendingAuto.push(g) // yeni otomatik ad ata
  }
  for (const g of pendingAuto) {
    let name = `N$${autoCounter++}`
    while (usedAuto.has(name)) name = `N$${autoCounter++}`
    groupName.set(g, name)
    usedAuto.add(name)
  }

  // Pinlere yaz + provenans kaydı (bu senkronun atadığı pinler)
  const assigned: Record<string, string> = {}
  for (const [g, memberPins] of groupPins) {
    const name = groupName.get(g)!
    for (const pin of memberPins) {
      const comp = project.components.find((c) => c.id === pin.componentId)
      if (comp) {
        comp.padNets[pin.padName] = name
        assigned[`${pin.componentId}::${pin.padName}`] = name
      }
    }
  }

  // Bayat şema atamalarını temizle: önceki senkronda tel üzerinden atanmış ama
  // artık hiçbir tele bağlı olmayan pinlerin neti kaldırılır (görsel olarak
  // şemada kalan hayalet etiket/ratsnest hatasını önler). Elle (PCB'de) verilmiş
  // atamalar provenans kaydında olmadığından dokunulmaz.
  if (project.settings.clearNetsOnPathDeleteSchematic ?? true) {
    const prev = project.schematic.pinNets ?? {}
    for (const [key, oldNet] of Object.entries(prev)) {
      if (assigned[key] !== undefined) continue // hâlâ tele bağlı
      const [compId, padName] = key.split('::')
      const comp = project.components.find((c) => c.id === compId)
      // Yalnız senkronun yazdığı değer değişmeden duruyorsa temizle
      if (comp && comp.padNets[padName] === oldNet) delete comp.padNets[padName]
    }
  }
  project.schematic.pinNets = assigned
}

/** Verilen telin bağlantı grubundaki (dokunarak birleşen) tüm tel id'leri */
export function wiresInGroup(project: Project, wireId: string): string[] {
  const wires = project.schematic.wires
  const start = wires.find((w) => w.id === wireId)
  if (!start) return []
  const group = new Set<string>([wireId])
  let grew = true
  while (grew) {
    grew = false
    for (const w of wires) {
      if (group.has(w.id)) continue
      const touches = wires.some(
        (m) =>
          group.has(m.id) &&
          (m.points.some((p) => pointOnWire(p, w.points)) ||
            w.points.some((p) => pointOnWire(p, m.points)))
      )
      if (touches) {
        group.add(w.id)
        grew = true
      }
    }
  }
  return [...group]
}

/** Tüm komponent pinlerinin `compId::pad → net` anlık görüntüsü. */
export function snapshotPadNets(project: Project): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of project.components) {
    for (const [pad, net] of Object.entries(c.padNets)) {
      if (net) map.set(`${c.id}::${pad}`, net)
    }
  }
  return map
}

/**
 * Bir pinin neti (before→after) gerçekten "başka bir bağlantıya" dönüştü mü?
 * - Pin kopmuşsa (yeni net boş) → evet
 * - İki elle adlandırılmış net arasında değiştiyse (GND→VCC) → evet
 * - Yalnız otomatik ad değiştiyse (N$3→N$5) → HAYIR (churn; izleri silme)
 */
function isStaleNetChange(oldNet: string, newNet: string): boolean {
  if (!oldNet) return false
  if (!newNet) return true
  if (oldNet === newNet) return false
  const oldAuto = /^N\$\d+$/.test(oldNet)
  const newAuto = /^N\$\d+$/.test(newNet)
  if (oldAuto || newAuto) return false
  return true
}

/**
 * Şema değişiminden sonra, neti değişen pinlerin ESKİ netine ait ve o pinin
 * pad'ine oturan PCB izlerini kaldırır (issue 8). `before`, değişiklikten önceki
 * `snapshotPadNets` sonucudur. Kaldırma yalnız gerçek bağlantı değişimlerinde
 * yapılır (bkz. isStaleNetChange), otomatik ad churn'ünde yapılmaz.
 */
export function removeStalePcbTraces(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  before: Map<string, string>
): number {
  const stale: { pos: Point; oldNet: string }[] = []
  for (const c of project.components) {
    const fp = getFootprint(c.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      const oldNet = before.get(`${c.id}::${pad.name}`) ?? ''
      const newNet = c.padNets[pad.name] ?? ''
      if (isStaleNetChange(oldNet, newNet)) {
        stale.push({ pos: padWorldPos(c, pad), oldNet })
      }
    }
  }
  if (stale.length === 0) return 0
  const tol = 0.3
  const before2 = project.traces.length
  project.traces = project.traces.filter((tr) => {
    if (!tr.net) return true
    const ends = [tr.points[0], tr.points[tr.points.length - 1]]
    for (const s of stale) {
      if (
        tr.net === s.oldNet &&
        ends.some((e) => Math.abs(e.x - s.pos.x) <= tol && Math.abs(e.y - s.pos.y) <= tol)
      ) {
        return false
      }
    }
    return true
  })
  return before2 - project.traces.length
}

/**
 * Şema netlerini senkronlar ve (ayar açıksa) şema değişiminden ötürü geçersiz
 * kalan eski PCB izlerini kaldırır. Şema tarafındaki tüm tel düzenlemelerinde
 * `syncSchematicNets` yerine bunu çağırın.
 */
export function syncSchematicNetsAndPcb(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): void {
  const before = snapshotPadNets(project)
  syncSchematicNets(project, getFootprint)
  if (project.settings.removePcbTracesOnSchematicChange ?? true) {
    removeStalePcbTraces(project, getFootprint, before)
  }
}

/**
 * Belirli bir telin uçlarına/segmentlerine değen komponent pinleri.
 * (Tel silinmeden ÖNCE çağrılır — hangi atamaların etkileneceğini bulmak için.)
 */
export function pinsOnWire(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  wirePoints: Point[]
): { componentId: string; padName: string }[] {
  const out: { componentId: string; padName: string }[] = []
  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pin of symbolLayout(fp).pins) {
      const pos = symbolToWorld(sym, pin.end)
      if (wirePoints.some((p) => near(p, pos)) || pointOnWire(pos, wirePoints)) {
        out.push({ componentId: comp.id, padName: pin.name })
      }
    }
  }
  return out
}

/**
 * Komponent(ler) silindikten SONRA çağrılır: silinen pinlere değen ve artık
 * hiçbir kalan pine VE hiçbir başka tele değmeyen telleri kaldırır. Böylece
 * silinen komponentin tel artıkları şemada asılı kalmaz; iki komponenti
 * bağlayan teller ise (bir ucu boşta kalsa da) korunur.
 */
export function removeOrphanWires(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  deletedPinPositions: Point[]
): number {
  if (deletedPinPositions.length === 0) return 0
  // Kalan tüm pin konumları
  const remainingPins: Point[] = []
  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pin of symbolLayout(fp).pins) {
      remainingPins.push(symbolToWorld(sym, pin.end))
    }
  }
  // Tel grubu (dokunarak bağlı zincir) bütün olarak değerlendirilir: grup
  // silinen bir pine değiyor ve kalan HİÇBİR pine değmiyorsa tümüyle kaldırılır.
  const before = project.schematic.wires.length
  const wires = project.schematic.wires
  const visited = new Set<string>()
  const removeIds = new Set<string>()
  const touchesAny = (w: { points: Point[] }, pts: Point[]) =>
    pts.some((p) => w.points.some((q) => near(q, p)) || pointOnWire(p, w.points))
  for (const w of wires) {
    if (visited.has(w.id)) continue
    const group = wiresInGroup(project, w.id)
    for (const id of group) visited.add(id)
    const members = wires.filter((x) => group.includes(x.id))
    const hitsDeleted = members.some((m) => touchesAny(m, deletedPinPositions))
    const hitsRemaining = members.some((m) => touchesAny(m, remainingPins))
    if (hitsDeleted && !hitsRemaining) for (const id of group) removeIds.add(id)
  }
  project.schematic.wires = wires.filter((w) => !removeIds.has(w.id))
  return before - project.schematic.wires.length
}

/** Herhangi bir tele (hâlâ) bağlı olan pinlerin `compId::padName` kümesi. */
export function schematicConnectedPins(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): Set<string> {
  const set = new Set<string>()
  const wires = project.schematic.wires
  if (wires.length === 0) return set
  for (const sym of project.schematic.symbols) {
    const comp = project.components.find((c) => c.id === sym.componentId)
    if (!comp) continue
    const fp = getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pin of symbolLayout(fp).pins) {
      const pos = symbolToWorld(sym, pin.end)
      for (const w of wires) {
        if (w.points.some((p) => near(p, pos)) || pointOnWire(pos, w.points)) {
          set.add(`${comp.id}::${pin.name}`)
          break
        }
      }
    }
  }
  return set
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
