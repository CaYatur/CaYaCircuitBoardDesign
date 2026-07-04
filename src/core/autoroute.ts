// ─── Otorouter ────────────────────────────────────────────────────────────
// Izgara tabanlı A* yol bulucu: çift katman, 45° hareket, otomatik via
// yerleştirme, engel şişirme (clearance) ve dönüş cezası ile temiz rotalar.

import type { Footprint, Point, Project, TraceSegment, Via } from '../types'
import { uid } from '../types'
import { Capsule, segPointDist } from './geometry'
import { analyzeNets, CopperItem } from './netlist'
import { t } from '../i18n'

export interface RouteResult {
  traces: TraceSegment[]
  vias: Via[]
  routedCount: number
  failedNets: string[]
  log: string[]
}

export interface AutorouteOptions {
  /** Izgara çözünürlüğü (mm) */
  resolution: number
  /** Çizilecek iz genişliği (mm) */
  traceWidth: number
  /** Via cezası (hücre birimi — yüksek = daha az via) */
  viaCost: number
  /** false → tek katman (yalnız üst bakır, via yok) */
  allowVias: boolean
}

interface GridSpec {
  res: number
  nx: number
  ny: number
}

/** İkili yığın (min-heap) — A* açık listesi */
class MinHeap {
  keys: number[] = []
  vals: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, val: number) {
    this.keys.push(key)
    this.vals.push(val)
    let i = this.keys.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= this.keys[i]) break
      this.swap(i, p)
      i = p
    }
  }
  pop(): number {
    const top = this.vals[0]
    const lastK = this.keys.pop()!
    const lastV = this.vals.pop()!
    if (this.keys.length > 0) {
      this.keys[0] = lastK
      this.vals[0] = lastV
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let m = i
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]]
  }
}

/** Kapsülü engel haritasına şişirilmiş yarıçapla işle */
function rasterizeCapsule(
  map: Uint8Array,
  grid: GridSpec,
  c: Capsule,
  inflate: number
) {
  const r = c.r + inflate
  const minX = Math.max(0, Math.floor((Math.min(c.x1, c.x2) - r) / grid.res))
  const maxX = Math.min(grid.nx - 1, Math.ceil((Math.max(c.x1, c.x2) + r) / grid.res))
  const minY = Math.max(0, Math.floor((Math.min(c.y1, c.y2) - r) / grid.res))
  const maxY = Math.min(grid.ny - 1, Math.ceil((Math.max(c.y1, c.y2) + r) / grid.res))
  const a = { x: c.x1, y: c.y1 }
  const b = { x: c.x2, y: c.y2 }
  for (let iy = minY; iy <= maxY; iy++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const px = ix * grid.res
      const py = iy * grid.res
      if (segPointDist(a, b, { x: px, y: py }) <= r) {
        map[iy * grid.nx + ix] = 1
      }
    }
  }
}

interface ObstacleMaps {
  /** [top, bottom] iz engelleri */
  trace: [Uint8Array, Uint8Array]
  /** via yerleşim engeli (iki katmanın birleşimi, via yarıçapıyla şişirilmiş) */
  via: Uint8Array
}

function buildObstacles(
  items: CopperItem[],
  resolvedNet: string[],
  net: string,
  grid: GridSpec,
  traceWidth: number,
  viaDiameter: number,
  clearance: number,
  board: { width: number; height: number },
  mountingHoles: { x: number; y: number; drill: number }[]
): ObstacleMaps {
  const size = grid.nx * grid.ny
  const top = new Uint8Array(size)
  const bottom = new Uint8Array(size)
  const viaMap = new Uint8Array(size)
  const traceInflate = traceWidth / 2 + clearance
  const viaInflate = viaDiameter / 2 + clearance

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it.capsule) continue // zone'lar dışa aktarım sırasında boşluk açar
    if (resolvedNet[i] === net && net !== '') continue // aynı net engel değil
    for (const layer of it.layers) {
      rasterizeCapsule(layer === 'top' ? top : bottom, grid, it.capsule, traceInflate)
    }
    rasterizeCapsule(viaMap, grid, it.capsule, viaInflate)
  }

  // Montaj delikleri her iki katmanda engel
  for (const h of mountingHoles) {
    const c: Capsule = { x1: h.x, y1: h.y, x2: h.x, y2: h.y, r: h.drill / 2 }
    rasterizeCapsule(top, grid, c, traceInflate)
    rasterizeCapsule(bottom, grid, c, traceInflate)
    rasterizeCapsule(viaMap, grid, c, viaInflate)
  }

  // Kart kenarı
  const edgeCells = Math.ceil((traceWidth / 2 + clearance) / grid.res)
  for (let iy = 0; iy < grid.ny; iy++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      if (
        ix < edgeCells || iy < edgeCells ||
        ix >= grid.nx - edgeCells || iy >= grid.ny - edgeCells
      ) {
        const idx = iy * grid.nx + ix
        top[idx] = 1
        bottom[idx] = 1
        viaMap[idx] = 1
      }
    }
  }

  return { trace: [top, bottom], via: viaMap }
}

// 8 yön: dx, dy, maliyet
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
] as const

const TURN_COST = 0.4 // dönüş cezası → daha düz rotalar

/**
 * Tek bir hava telini (airwire) A* ile rotala.
 * Dönüş: katman değişim noktaları via olan nokta listesi, ya da null (başarısız).
 */
function routeAirwire(
  start: Point,
  goal: Point,
  startLayers: number[],
  goalLayers: number[],
  obstacles: ObstacleMaps,
  grid: GridSpec,
  viaCost: number,
  allowVias: boolean
): { points: Point[]; layers: number[] } | null {
  const { nx, ny } = grid
  const layerSize = nx * ny
  const stateCount = layerSize * 2

  const sx = Math.round(start.x / grid.res)
  const sy = Math.round(start.y / grid.res)
  const gx = Math.round(goal.x / grid.res)
  const gy = Math.round(goal.y / grid.res)
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 ||
      sx >= nx || sy >= ny || gx >= nx || gy >= ny) return null

  const gScore = new Float64Array(stateCount).fill(Infinity)
  const parent = new Int32Array(stateCount).fill(-1)
  const parentDir = new Int8Array(stateCount).fill(-1)
  const heap = new MinHeap()

  const h = (ix: number, iy: number) => {
    const dx = Math.abs(ix - gx)
    const dy = Math.abs(iy - gy)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }

  for (const layer of startLayers) {
    const s = layer * layerSize + sy * nx + sx
    gScore[s] = 0
    heap.push(h(sx, sy), s)
  }

  const goalStates = new Set(goalLayers.map((l) => l * layerSize + gy * nx + gx))
  let found = -1
  let iterations = 0
  const maxIterations = 600000

  while (heap.size > 0 && iterations < maxIterations) {
    iterations++
    const cur = heap.pop()
    if (goalStates.has(cur)) {
      found = cur
      break
    }
    const layer = cur >= layerSize ? 1 : 0
    const cell = cur - layer * layerSize
    const cy = Math.floor(cell / nx)
    const cx = cell - cy * nx
    const curG = gScore[cur]
    const curDir = parentDir[cur]

    // 8 yönde hareket
    for (let d = 0; d < 8; d++) {
      const [dx, dy, cost] = DIRS[d]
      const tx = cx + dx
      const ty = cy + dy
      if (tx < 0 || ty < 0 || tx >= nx || ty >= ny) continue
      const nCell = ty * nx + tx
      // Hedef hücresi her zaman girilebilir (pad merkezi engel sayılmasın)
      const isGoal = tx === gx && ty === gy
      if (!isGoal && obstacles.trace[layer][nCell]) continue
      const next = layer * layerSize + nCell
      const turnPenalty = curDir >= 0 && curDir !== d ? TURN_COST : 0
      const ng = curG + cost + turnPenalty
      if (ng < gScore[next]) {
        gScore[next] = ng
        parent[next] = cur
        parentDir[next] = d
        heap.push(ng + h(tx, ty), next)
      }
    }

    // Katman değiştir (via) — tek katman modunda kapalı
    if (allowVias && !obstacles.via[cell]) {
      const otherLayer = 1 - layer
      const next = otherLayer * layerSize + cell
      const ng = curG + viaCost
      if (ng < gScore[next]) {
        gScore[next] = ng
        parent[next] = cur
        parentDir[next] = -1
        heap.push(ng + h(cx, cy), next)
      }
    }
  }

  if (found < 0) return null

  // Yolu geri izle
  const rawPoints: Point[] = []
  const rawLayers: number[] = []
  let cur = found
  while (cur >= 0) {
    const layer = cur >= layerSize ? 1 : 0
    const cell = cur - layer * layerSize
    const cy = Math.floor(cell / nx)
    const cx = cell - cy * nx
    rawPoints.unshift({ x: cx * grid.res, y: cy * grid.res })
    rawLayers.unshift(layer)
    cur = parent[cur]
  }

  // Eşdoğrusal noktaları birleştir (katman değişimlerini koru)
  const points: Point[] = [rawPoints[0]]
  const layers: number[] = [rawLayers[0]]
  for (let i = 1; i < rawPoints.length - 1; i++) {
    const prev = points[points.length - 1]
    const curP = rawPoints[i]
    const next = rawPoints[i + 1]
    const layerChange =
      rawLayers[i] !== rawLayers[i - 1] || rawLayers[i + 1] !== rawLayers[i]
    const collinear =
      Math.sign(curP.x - prev.x) === Math.sign(next.x - curP.x) &&
      Math.sign(curP.y - prev.y) === Math.sign(next.y - curP.y) &&
      (curP.x - prev.x) * (next.y - curP.y) === (curP.y - prev.y) * (next.x - curP.x)
    if (layerChange || !collinear) {
      points.push(curP)
      layers.push(rawLayers[i])
    }
  }
  points.push(rawPoints[rawPoints.length - 1])
  layers.push(rawLayers[rawLayers.length - 1])

  // Uçları gerçek pad merkezlerine bağla
  points[0] = { ...start }
  points[points.length - 1] = { ...goal }

  return { points, layers }
}

/**
 * Tüm eksik bağlantıları (ratsnest) otomatik rotala.
 * Kısa bağlantılar önce rotalanır; her başarılı rota sonraki rotalar için
 * engel haritasına eklenir.
 */
export function autorouteAll(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  options?: Partial<AutorouteOptions>
): RouteResult {
  const res = options?.resolution ?? project.settings.autorouteResolution ?? 0.25
  const grid: GridSpec = {
    res,
    nx: Math.ceil(project.board.width / res) + 1,
    ny: Math.ceil(project.board.height / res) + 1
  }
  const traceWidth = options?.traceWidth ?? project.settings.defaultTraceWidth
  const viaCost = options?.viaCost ?? project.settings.autorouteViaCost ?? 25
  const allowVias = options?.allowVias ?? project.board.layerCount === 2
  const viaDiameter = project.settings.defaultViaDiameter
  const clearance = project.rules.clearance

  const result: RouteResult = {
    traces: [],
    vias: [],
    routedCount: 0,
    failedNets: [],
    log: []
  }

  // Çalışma kopyası: yeni rotalar eklendikçe analiz güncellenir
  const working: Project = {
    ...project,
    traces: [...project.traces],
    vias: [...project.vias]
  }

  for (let pass = 0; pass < 50; pass++) {
    const analysis = analyzeNets(working, getFootprint)
    if (analysis.airwires.length === 0) break

    // En kısa hava telinden başla
    const sorted = [...analysis.airwires].sort(
      (a, b) =>
        Math.hypot(a.x2 - a.x1, a.y2 - a.y1) - Math.hypot(b.x2 - b.x1, b.y2 - b.y1)
    )
    const aw = sorted.find((w) => !result.failedNets.includes(w.net))
    if (!aw) break

    // Uç pad'lerin katmanlarını bul (tek katman modunda yalnız üst)
    const findPadLayers = (x: number, y: number): number[] => {
      for (const it of analysis.items) {
        if (it.kind === 'pad' && Math.hypot(it.x - x, it.y - y) < 0.01) {
          const layers = it.layers.map((l) => (l === 'top' ? 0 : 1))
          return allowVias ? layers : layers.filter((l) => l === 0)
        }
      }
      return allowVias ? [0, 1] : [0]
    }

    const obstacles = buildObstacles(
      analysis.items,
      analysis.resolvedNet,
      aw.net,
      grid,
      traceWidth,
      viaDiameter,
      clearance,
      working.board,
      working.board.mountingHoles
    )

    const startLayers = findPadLayers(aw.x1, aw.y1)
    const goalLayers = findPadLayers(aw.x2, aw.y2)
    if (startLayers.length === 0 || goalLayers.length === 0) {
      result.failedNets.push(aw.net)
      result.log.push(
        `✗ "${aw.net}" — ` + t('SMD pad tek katman modunda erişilemez')
      )
      continue
    }

    const route = routeAirwire(
      { x: aw.x1, y: aw.y1 },
      { x: aw.x2, y: aw.y2 },
      startLayers,
      goalLayers,
      obstacles,
      grid,
      viaCost,
      allowVias
    )

    if (!route) {
      result.failedNets.push(aw.net)
      result.log.push(`✗ "${aw.net}" — ` + t('rotalanamadı, yol bulunamadı'))
      continue
    }

    // Yolu katman değişimlerinden bölerek trace + via üret
    let segStart = 0
    for (let i = 1; i <= route.points.length; i++) {
      const atEnd = i === route.points.length
      const layerChanged = !atEnd && route.layers[i] !== route.layers[segStart]
      if (atEnd || layerChanged) {
        const pts = route.points.slice(segStart, i)
        if (pts.length >= 2) {
          const trace: TraceSegment = {
            id: uid('t'),
            layer: route.layers[segStart] === 0 ? 'top' : 'bottom',
            points: pts,
            width: traceWidth,
            net: aw.net
          }
          result.traces.push(trace)
          working.traces.push(trace)
        }
        if (layerChanged) {
          const via: Via = {
            id: uid('v'),
            x: route.points[i - 1].x,
            y: route.points[i - 1].y,
            diameter: viaDiameter,
            drill: project.settings.defaultViaDrill,
            net: aw.net
          }
          result.vias.push(via)
          working.vias.push(via)
          // Yeni segment, via noktasının yeni katmandaki kopyasından başlar
          segStart = i
        }
      }
    }

    result.routedCount++
    result.log.push(
      `✓ "${aw.net}" — ` + t('rotalandı ({n} nokta)', { n: route.points.length })
    )
  }

  return result
}
