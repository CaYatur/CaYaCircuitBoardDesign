// ─── Canvas render motoru ─────────────────────────────────────────────────
// Kart, bakır katmanlar, pad'ler, delikler, silkscreen, ratsnest, seçim
// vurgusu, çizim önizlemesi ve DRC işaretlerini çizer.

import type {
  ComponentInstance,
  CopperLayer,
  DrcViolation,
  Footprint,
  Point,
  Project,
  Selection,
  VisibleLayer
} from '../types'
import type { Airwire } from '../core/netlist'
import {
  localToWorld,
  padWorldPos,
  padDrillWorldPos,
  padWorldSize,
  componentBBox,
  transformArcAngles,
  pointInPolygon
} from '../core/geometry'
import { placeText } from './vectorFont'
import { pinSilkLabels } from '../core/pinSilk'
import { formatLen, unitSuffix } from '../core/units'
import { getCachedImage } from './imageCache'
import type { ZoneFillResult } from '../core/zoneFill'
import {
  boardEditablePolygon,
  cutoutOutlinePoints,
  filletPolygon,
  polygonOutlinePoints
} from '../core/boardGeometry'
import { builtinFootprints } from '../library/footprints'

const builtinFootprintIds = new Set(builtinFootprints.map((fp) => fp.id))

export interface View {
  x: number
  y: number
  scale: number // px / mm
}

export const worldToScreen = (v: View, p: Point): Point => ({
  x: p.x * v.scale + v.x,
  y: p.y * v.scale + v.y
})

export const screenToWorld = (v: View, p: Point): Point => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale
})

/** Kartı ekrana sığdıran görünüm hesapla */
export function fitBoardView(
  project: Project,
  width: number,
  height: number
): View {
  const margin = 60
  // Tuval henüz ölçülmediyse (0/negatif boyut) fit negatif ölçek üretmesin —
  // aksi halde çizim negatif yarıçaplı arcTo/ellipse ile tüm editörü çökertir.
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const bw = Math.max(1, project.board.width)
  const bh = Math.max(1, project.board.height)
  const scale = Math.max(
    0.1,
    Math.min((w - margin * 2) / bw, (h - margin * 2) / bh)
  )
  return {
    scale,
    x: (w - bw * scale) / 2,
    y: (h - bh * scale) / 2
  }
}

export const COLORS = {
  bg: '#14171c',
  boardFill: '#1e261e',
  boardEdge: '#d8c24a',
  gridMinor: 'rgba(255,255,255,0.08)',
  gridMajor: 'rgba(255,255,255,0.2)',
  top: '#d94f3d',
  bottom: '#4a7fdb',
  topSilk: '#e8e8e8',
  bottomSilk: '#c9a2e8',
  padGold: '#d4af37',
  hole: '#0e1116',
  ratsnest: '#e8d44d',
  selection: '#3fd3dc',
  drc: '#ff3860',
  measure: '#7ee787',
  zoneTop: 'rgba(217,79,61,0.25)',
  zoneBottom: 'rgba(74,127,219,0.25)'
}

export interface RenderState {
  project: Project
  getFootprint: (id: string) => Footprint | undefined
  view: View
  width: number
  height: number
  visibleLayers: Record<VisibleLayer, boolean>
  activeLayer: CopperLayer
  /** Kartı arkadan görüntüle — tüm sahne sol-sağ aynalanır (gerçek fiziksel
   *  kartı ters çevirip arka yüzden bakmanın 2B karşılığı) */
  viewFlipped?: boolean
  selection: Selection
  drawingTrace: { points: Point[]; layer: CopperLayer; width: number } | null
  drawingBoardOutline: Point[] | null
  /** Çizilmekte olan serbest bakır alan (zone) sınırı */
  drawingZone: Point[] | null
  /** Zone id → otomatik hesaplanmış gerçek dolgu şekli (bkz. core/zoneFill.ts) */
  zoneFills: Map<string, ZoneFillResult>
  mouseWorld: Point | null
  /** Çizim sırasında 45° yaslanmış imleç noktası */
  snappedCursor: Point | null
  airwires: Airwire[]
  drcViolations: DrcViolation[] | null
  placingFootprintId: string | null
  marquee: { x1: number; y1: number; x2: number; y2: number } | null
  measure: { a: Point; b: Point } | null
  /** Tek tek seçilmiş iz köşe noktası (vurgulanır) */
  selectedVertex?: { traceId: string; index: number } | null
  /** Yerleştirilmekte olan görsel (hayalet önizleme) */
  placingImage?: { src: string; format: 'png' | 'svg'; width: number; height: number } | null
  /** Görsel yüklenince editörün yeniden çizmesi için */
  onImageLoad?: () => void
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState): void {
  const { view, project } = s
  ctx.save()
  if (s.viewFlipped) {
    // Tüm sahneyi kartın/tuvalin dikey ekseninde aynala — fiziksel kartı
    // ters çevirip arka yüzden bakmanın karşılığı (yazılar da doğru şekilde
    // aynalanır: alt katmandaki metin artık okunaklı, üstteki ters görünür)
    ctx.translate(s.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, s.width, s.height)

  // ── Kart zemini (lehim maskesi rengi) ──
  ctx.beginPath()
  boardOutlinePath(ctx, view, project)
  ctx.fillStyle = project.board.color || COLORS.boardFill
  ctx.fill()

  // ── İç kesimler (delik/yuva) — zemin rengiyle boşalt; kart dış hattına
  // kliplenir ki kesim kenarı taşarsa dolgu kartın dışına sarkmasın ──
  const cutouts = project.board.cutouts
  if (cutouts && cutouts.length > 0) {
    ctx.save()
    ctx.beginPath()
    boardOutlinePath(ctx, view, project)
    ctx.clip()
    ctx.fillStyle = COLORS.bg
    for (const cut of cutouts) {
      const pts = cutoutOutlinePoints(cut)
      if (pts.length < 2) continue
      ctx.beginPath()
      const p0 = worldToScreen(view, pts[0])
      ctx.moveTo(p0.x, p0.y)
      for (const p of pts.slice(1)) {
        const sp = worldToScreen(view, p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  // ── Izgara (kart alanına kırpılmış, kesimler hariç) ──
  if ((project.settings.gridStyle ?? 'lines') !== 'off') {
    ctx.save()
    ctx.beginPath()
    boardOutlinePath(ctx, view, project)
    ctx.clip()
    drawGrid(ctx, s)
    ctx.restore()
  }

  const topVisible = s.visibleLayers.top
  const bottomVisible = s.visibleLayers.bottom

  // ── Bakır alanlar (zone) — otomatik hesaplanmış gerçek dolgu şekli:
  // farklı netteki öğelerin çevresi boşaltılmış, aynı netteki THT pad/via'lara
  // ısı yalıtım (thermal relief) köprüleri eklenmiş (bkz. core/zoneFill.ts) ──
  if (s.visibleLayers.zones) {
    for (const z of project.zones) {
      if (z.layer === 'top' && !topVisible) continue
      if (z.layer === 'bottom' && !bottomVisible) continue
      const fill = s.zoneFills.get(z.id)
      ctx.fillStyle = z.layer === 'top' ? COLORS.zoneTop : COLORS.zoneBottom
      if (fill && fill.islands.length > 0) {
        for (const isl of fill.islands) {
          if (isl.outer.length < 3) continue
          ctx.beginPath()
          const p0 = worldToScreen(view, isl.outer[0])
          ctx.moveTo(p0.x, p0.y)
          for (const p of isl.outer.slice(1)) {
            const sp = worldToScreen(view, p)
            ctx.lineTo(sp.x, sp.y)
          }
          ctx.closePath()
          for (const hole of isl.holes) {
            if (hole.length < 3) continue
            const h0 = worldToScreen(view, hole[0])
            ctx.moveTo(h0.x, h0.y)
            for (const p of hole.slice(1)) {
              const sp = worldToScreen(view, p)
              ctx.lineTo(sp.x, sp.y)
            }
            ctx.closePath()
          }
          ctx.fill('evenodd')
        }
      }
      // Çizilen sınır (dış hat) — kesikli çizgi
      ctx.strokeStyle = z.layer === 'top' ? COLORS.top : COLORS.bottom
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      const b0 = worldToScreen(view, z.points[0])
      ctx.moveTo(b0.x, b0.y)
      for (const p of z.points.slice(1)) {
        const sp = worldToScreen(view, p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // ── Çizilmekte olan zone taslağı ──
  if (s.drawingZone && s.drawingZone.length > 0) {
    ctx.strokeStyle = '#ffd166'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    const z0 = worldToScreen(view, s.drawingZone[0])
    ctx.moveTo(z0.x, z0.y)
    for (const p of s.drawingZone.slice(1)) {
      const sp = worldToScreen(view, p)
      ctx.lineTo(sp.x, sp.y)
    }
    if (s.mouseWorld) {
      const sp = worldToScreen(view, s.mouseWorld)
      ctx.lineTo(sp.x, sp.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ffd166'
    for (const p of s.drawingZone) {
      const sp = worldToScreen(view, p)
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ── Bakır: önce pasif katman, sonra aktif katman üstte ──
  const layerOrder: CopperLayer[] =
    s.activeLayer === 'top' ? ['bottom', 'top'] : ['top', 'bottom']
  for (const layer of layerOrder) {
    if (layer === 'top' && !topVisible) continue
    if (layer === 'bottom' && !bottomVisible) continue
    const alpha = layer === s.activeLayer ? 0.92 : 0.45
    drawCopperLayer(ctx, s, layer, alpha)
  }

  // ── THT pad'ler (altın, her iki katman) ──
  drawThtPads(ctx, s)

  // ── Vialar ──
  if (topVisible || bottomVisible) {
    for (const via of project.vias) {
      const p = worldToScreen(view, via)
      const r = (via.diameter / 2) * view.scale
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.padGold
      ctx.fill()
      if (s.visibleLayers.drill) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, (via.drill / 2) * view.scale, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.hole
        ctx.fill()
      }
    }
  }

  // ── Silkscreen ──
  if (s.visibleLayers['top-silk']) drawSilk(ctx, s, 'top')
  if (s.visibleLayers['bottom-silk']) drawSilk(ctx, s, 'bottom')

  // ── Görseller (logo/işaret) ──
  drawImages(ctx, s)

  // ── Pad adları ve net etiketleri ──
  // 'off'        : yalnız pad içi (yakınlaşınca)
  // 'zoomed-out' : yakınlaşınca pad içi, uzaklaşınca pad yanında (varsayılan)
  // 'always'     : her zaman pad yanında (hizalı, üst üste binmez)
  {
    const mode = project.settings.padLabelMode ?? 'zoomed-out'
    const showOnPad = view.scale >= 13 && mode !== 'always'
    const showOutside = mode === 'always' || (mode === 'zoomed-out' && view.scale < 13)
    if (showOnPad) drawPadLabels(ctx, s)
    if (showOutside) drawPadLabelsOutside(ctx, s)
  }

  // ── Kart dış hattı ve montaj delikleri ──
  if (s.visibleLayers.outline) {
    // Kart dış hattı çizgi kalınlığı (mm → px), ayardan; okunur bir taban değerle
    const edgePx = Math.max(1.2, (project.board.outlineWidth ?? 0.3) * view.scale)
    ctx.beginPath()
    boardOutlinePath(ctx, view, project)
    ctx.strokeStyle = COLORS.boardEdge
    ctx.lineWidth = edgePx
    ctx.stroke()
    // İç kesim sınırları — kart dış hattına kliplenir ki kesim kart kenarını
    // taşarsa çizgi kartın dışına "çerçeve" gibi sarkmasın
    if (cutouts && cutouts.length > 0) {
      ctx.save()
      ctx.beginPath()
      boardOutlinePath(ctx, view, project)
      ctx.clip()
      ctx.strokeStyle = COLORS.boardEdge
      ctx.lineWidth = Math.max(1, edgePx * 0.85)
      for (const cut of cutouts) {
        const pts = cutoutOutlinePoints(cut)
        if (pts.length < 2) continue
        ctx.beginPath()
        const p0 = worldToScreen(view, pts[0])
        ctx.moveTo(p0.x, p0.y)
        for (const p of pts.slice(1)) {
          const sp = worldToScreen(view, p)
          ctx.lineTo(sp.x, sp.y)
        }
        ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()
    }
    for (const h of project.board.mountingHoles) {
      const p = worldToScreen(view, h)
      ctx.beginPath()
      ctx.arc(p.x, p.y, (h.drill / 2) * view.scale, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.hole
      ctx.fill()
      ctx.strokeStyle = COLORS.boardEdge
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // ── Ratsnest ──
  if (s.visibleLayers.ratsnest) {
    ctx.strokeStyle = COLORS.ratsnest
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    for (const aw of s.airwires) {
      const a = worldToScreen(view, { x: aw.x1, y: aw.y1 })
      const b = worldToScreen(view, { x: aw.x2, y: aw.y2 })
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // ── Seçim vurgusu ──
  drawSelection(ctx, s)

  // ── Çizilmekte olan iz önizlemesi ──
  if (s.drawingTrace && s.drawingTrace.points.length > 0) {
    const pts = s.drawingTrace.points.map((p) => worldToScreen(view, p))
    ctx.strokeStyle = s.drawingTrace.layer === 'top' ? COLORS.top : COLORS.bottom
    ctx.lineWidth = Math.max(2, s.drawingTrace.width * view.scale)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
    if (s.snappedCursor) {
      const c = worldToScreen(view, s.snappedCursor)
      ctx.lineTo(c.x, c.y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── Çizilmekte olan kart dış hattı önizlemesi ──
  if (s.drawingBoardOutline && s.drawingBoardOutline.length > 0) {
    const pts = s.drawingBoardOutline.map((p) => worldToScreen(view, p))
    ctx.strokeStyle = COLORS.selection
    ctx.fillStyle = 'rgba(63,211,220,0.12)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
    if (s.mouseWorld) {
      const c = worldToScreen(view, s.mouseWorld)
      ctx.lineTo(c.x, c.y)
    }
    if (pts.length > 2) ctx.closePath()
    ctx.stroke()
    if (pts.length > 2) ctx.fill()
    ctx.setLineDash([])
    for (const p of pts) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
    }
  }

  // ── Yaslanmış imleç ──
  if (s.snappedCursor) {
    const c = worldToScreen(view, s.snappedCursor)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(c.x - 8, c.y)
    ctx.lineTo(c.x + 8, c.y)
    ctx.moveTo(c.x, c.y - 8)
    ctx.lineTo(c.x, c.y + 8)
    ctx.stroke()
  }

  // ── Yerleştirme hayaleti ──
  if (s.placingFootprintId && s.mouseWorld) {
    const fp = s.getFootprint(s.placingFootprintId)
    if (fp) {
      ctx.globalAlpha = 0.55
      const ghost: ComponentInstance = {
        id: 'ghost',
        footprintId: fp.id,
        refDes: '',
        value: '',
        x: s.mouseWorld.x,
        y: s.mouseWorld.y,
        rotation: 0,
        side: s.activeLayer,
        padNets: {}
      }
      drawComponentCopper(ctx, s, ghost, fp, s.activeLayer, 1)
      drawComponentThtPads(ctx, s, ghost, fp)
      drawComponentSilk(ctx, s, ghost, fp, s.activeLayer)
      ctx.globalAlpha = 1
    }
  }

  // ── Görsel yerleştirme hayaleti ──
  if (s.placingImage && s.mouseWorld) {
    const pi = s.placingImage
    const img = getCachedImage(pi.src, s.onImageLoad ?? (() => {}))
    const w = pi.width * view.scale
    const h = pi.height * view.scale
    const cx = s.mouseWorld.x * view.scale + view.x
    const cy = s.mouseWorld.y * view.scale + view.y
    ctx.save()
    ctx.globalAlpha = 0.6
    if (img) ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    ctx.strokeStyle = COLORS.selection
    ctx.setLineDash([5, 3])
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h)
    ctx.setLineDash([])
    ctx.restore()
  }

  // ── Marquee (alan seçimi) ──
  if (s.marquee) {
    const a = worldToScreen(view, { x: s.marquee.x1, y: s.marquee.y1 })
    const b = worldToScreen(view, { x: s.marquee.x2, y: s.marquee.y2 })
    ctx.strokeStyle = COLORS.selection
    ctx.fillStyle = 'rgba(63,211,220,0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    ctx.setLineDash([])
  }

  // ── Ölçüm ──
  if (s.measure) {
    const a = worldToScreen(view, s.measure.a)
    const b = worldToScreen(view, s.measure.b)
    ctx.strokeStyle = COLORS.measure
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const dx = s.measure.b.x - s.measure.a.x
    const dy = s.measure.b.y - s.measure.a.y
    const len = Math.hypot(dx, dy)
    const u = s.project.settings.units ?? 'mm'
    const label = `${formatLen(len, u)} ${unitSuffix(u)}  (Δx ${formatLen(dx, u)}, Δy ${formatLen(dy, u)})`
    ctx.font = '12px system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2 - 12
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(mx - tw / 2 - 5, my - 12, tw + 10, 18)
    ctx.fillStyle = COLORS.measure
    ctx.textAlign = 'center'
    ctx.fillText(label, mx, my)
    ctx.textAlign = 'left'
  }

  // ── DRC işaretleri ──
  if (s.drcViolations) {
    for (const v of s.drcViolations) {
      const p = worldToScreen(view, v)
      ctx.strokeStyle = v.severity === 'error' ? COLORS.drc : '#ffb347'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x - 5, p.y - 5)
      ctx.lineTo(p.x + 5, p.y + 5)
      ctx.moveTo(p.x + 5, p.y - 5)
      ctx.lineTo(p.x - 5, p.y + 5)
      ctx.stroke()
    }
  }

  // ── Orijin işareti ──
  const o = worldToScreen(view, { x: 0, y: 0 })
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(o.x - 10, o.y)
  ctx.lineTo(o.x + 10, o.y)
  ctx.moveTo(o.x, o.y - 10)
  ctx.lineTo(o.x, o.y + 10)
  ctx.stroke()

  ctx.restore()
}

// ─── Alt çizim fonksiyonları ──────────────────────────────────────────────

/** Kart şekline göre ekran uzayında yol oluşturur (fill/stroke/clip için ortak) */
function boardOutlinePath(ctx: CanvasRenderingContext2D, view: View, project: Project) {
  const { board } = project
  const bx = view.x
  const by = view.y
  const bw = board.width * view.scale
  const bh = board.height * view.scale

  if (board.shape === 'polygon' && board.points && board.points.length >= 3) {
    const pts = polygonOutlinePoints(board)
    if (pts.length) {
      const p0 = worldToScreen(view, pts[0])
      ctx.moveTo(p0.x, p0.y)
      for (const p of pts.slice(1)) {
        const sp = worldToScreen(view, p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.closePath()
    }
    return
  }

  if (board.shape === 'circle' || board.shape === 'oval') {
    ctx.ellipse(bx + bw / 2, by + bh / 2, Math.max(0, bw / 2), Math.max(0, bh / 2), 0, 0, Math.PI * 2)
    return
  }

  const cr = board.cornerRadius * view.scale
  roundRect(ctx, bx, by, bw, bh, cr)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  // Negatif yarıçap arcTo'yu (dolayısıyla tüm render'ı) çökertir — 0'a kırp
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Gerçek ızgara: dünya orijinine (0,0) yaslı, seçilen ızgara boyutunu birebir
 * yansıtan minor/major çizgiler. Çok sıklaşınca (piksel aralığı küçülünce)
 * uyarlanabilir biçimde görünen adım büyütülür; böylece hem hızlı hem okunur.
 * `gridStyle` 'dots' ise kesişimlerde nokta çizer.
 */
function drawGrid(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project } = s
  const style = project.settings.gridStyle ?? 'lines'
  const grid = project.settings.gridSize
  if (grid <= 0) return

  const startX = view.x // dünya x=0
  const startY = view.y // dünya y=0
  const endX = view.x + project.board.width * view.scale
  const endY = view.y + project.board.height * view.scale

  // Görünen minor adım: ekranda en az ~6 px olacak şekilde ızgaranın tam katı.
  const rawPx = grid * view.scale
  const k = rawPx >= 6 ? 1 : Math.ceil(6 / rawPx)
  const minorWorld = grid * k
  const minorPx = minorWorld * view.scale

  // Major çizgi: minor'ün 5 veya 10 katı — ekranda ~40 px'i geçen ilk katı seç.
  const majorFactor = minorPx * 5 >= 40 ? 5 : 10
  const majorWorld = minorWorld * majorFactor

  // Dünya orijinine (0,0) yaslı çizgiler — kart sol-üst köşesi world (0,0)
  const linesX: number[] = []
  const majorX = new Set<number>()
  for (let wx = 0; wx <= project.board.width + 1e-6; wx += minorWorld) {
    const sx = view.x + wx * view.scale
    linesX.push(sx)
    if (Math.abs(wx / majorWorld - Math.round(wx / majorWorld)) < 1e-6) majorX.add(sx)
  }
  const linesY: number[] = []
  const majorY = new Set<number>()
  for (let wy = 0; wy <= project.board.height + 1e-6; wy += minorWorld) {
    const sy = view.y + wy * view.scale
    linesY.push(sy)
    if (Math.abs(wy / majorWorld - Math.round(wy / majorWorld)) < 1e-6) majorY.add(sy)
  }

  if (style === 'dots') {
    // Kesişim noktaları — major daha parlak
    const r = minorPx >= 14 ? 1.1 : 0.8
    for (const gx of linesX) {
      for (const gy of linesY) {
        const major = majorX.has(gx) && majorY.has(gy)
        ctx.fillStyle = major ? COLORS.gridMajor : COLORS.gridMinor
        ctx.beginPath()
        ctx.arc(gx, gy, major ? r + 0.4 : r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    return
  }

  // Çizgi ızgara — önce minor, sonra major üstte
  ctx.strokeStyle = COLORS.gridMinor
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const gx of linesX) {
    if (majorX.has(gx)) continue
    ctx.moveTo(Math.round(gx) + 0.5, startY)
    ctx.lineTo(Math.round(gx) + 0.5, endY)
  }
  for (const gy of linesY) {
    if (majorY.has(gy)) continue
    ctx.moveTo(startX, Math.round(gy) + 0.5)
    ctx.lineTo(endX, Math.round(gy) + 0.5)
  }
  ctx.stroke()

  ctx.strokeStyle = COLORS.gridMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const gx of majorX) {
    ctx.moveTo(Math.round(gx) + 0.5, startY)
    ctx.lineTo(Math.round(gx) + 0.5, endY)
  }
  for (const gy of majorY) {
    ctx.moveTo(startX, Math.round(gy) + 0.5)
    ctx.lineTo(endX, Math.round(gy) + 0.5)
  }
  ctx.stroke()
}

function drawCopperLayer(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  layer: CopperLayer,
  alpha: number
) {
  const { view, project } = s
  const color = layer === 'top' ? COLORS.top : COLORS.bottom
  ctx.globalAlpha = alpha

  // İzler
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const trace of project.traces) {
    if (trace.layer !== layer) continue
    ctx.lineWidth = Math.max(1, trace.width * view.scale)
    ctx.beginPath()
    const p0 = worldToScreen(view, trace.points[0])
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < trace.points.length; i++) {
      const p = worldToScreen(view, trace.points[i])
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }

  // SMD pad'ler
  for (const comp of project.components) {
    const fp = s.getFootprint(comp.footprintId)
    if (fp) drawComponentCopper(ctx, s, comp, fp, layer, alpha)
  }

  ctx.globalAlpha = 1
}

function drawComponentCopper(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  comp: ComponentInstance,
  fp: Footprint,
  layer: CopperLayer,
  alpha: number
) {
  const { view } = s
  const color = layer === 'top' ? COLORS.top : COLORS.bottom
  ctx.fillStyle = color
  for (const pad of fp.pads) {
    if (pad.drill || pad.layer === 'both') continue // THT ayrı çizilir
    const effLayer =
      comp.side === 'bottom' ? (pad.layer === 'top' ? 'bottom' : 'top') : pad.layer
    if (effLayer !== layer) continue
    drawPadShape(ctx, s, comp, pad)
  }
}

function drawPadShape(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  comp: ComponentInstance,
  pad: import('../types').PadDef
) {
  const { view } = s
  const pos = worldToScreen(view, padWorldPos(comp, pad))
  const { width, height } = padWorldSize(comp, pad)
  const w = width * view.scale
  const h = height * view.scale
  if (pad.shape === 'circle') {
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, Math.max(w, h) / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (pad.shape === 'oval') {
    ctx.beginPath()
    const r = Math.min(w, h) / 2
    roundRect(ctx, pos.x - w / 2, pos.y - h / 2, w, h, r)
    ctx.fill()
  } else {
    ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h)
  }
}

function drawThtPads(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project } = s
  if (!s.visibleLayers.top && !s.visibleLayers.bottom) return
  for (const comp of project.components) {
    const fp = s.getFootprint(comp.footprintId)
    if (fp) drawComponentThtPads(ctx, s, comp, fp)
  }
}

function drawComponentThtPads(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  comp: ComponentInstance,
  fp: Footprint
) {
  const { view } = s
  for (const pad of fp.pads) {
    if (!pad.drill && pad.layer !== 'both') continue
    ctx.fillStyle = COLORS.padGold
    drawPadShape(ctx, s, comp, pad)
    if (pad.drill && s.visibleLayers.drill) {
      const pos = worldToScreen(view, padDrillWorldPos(comp, pad))
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, (pad.drill / 2) * view.scale, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.hole
      ctx.fill()
    }
  }
}

function drawSilk(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  side: CopperLayer
) {
  const { view, project } = s
  const color = side === 'top' ? COLORS.topSilk : COLORS.bottomSilk
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'

  for (const comp of project.components) {
    if (comp.side !== side) continue
    const fp = s.getFootprint(comp.footprintId)
    if (fp) drawComponentSilk(ctx, s, comp, fp, side)
  }

  // Bağımsız yazılar
  const textLayer = side === 'top' ? 'top-silk' : 'bottom-silk'
  for (const t of project.texts) {
    if (t.layer !== textLayer) continue
    const { strokes, strokeWidth } = placeText(
      t.text,
      t,
      t.size,
      t.rotation,
      side === 'bottom',
      'center',
      { font: t.font }
    )
    ctx.lineWidth = Math.max(1, strokeWidth * (t.bold ? 1.9 : 1) * view.scale)
    for (const poly of strokes) {
      ctx.beginPath()
      const p0 = worldToScreen(view, poly[0])
      ctx.moveTo(p0.x, p0.y)
      for (const p of poly.slice(1)) {
        const sp = worldToScreen(view, p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
    }
  }
}

/** Karta yerleştirilen görselleri (logo/işaret) çizer */
function drawImages(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project } = s
  for (const im of project.images) {
    const visible =
      im.layer === 'top-silk' ? s.visibleLayers['top-silk'] : s.visibleLayers['bottom-silk']
    if (!visible) continue
    const img = getCachedImage(im.src, s.onImageLoad ?? (() => {}))
    const cx = (im.x + im.width / 2) * view.scale + view.x
    const cy = (im.y + im.height / 2) * view.scale + view.y
    const w = im.width * view.scale
    const h = im.height * view.scale
    ctx.save()
    ctx.globalAlpha = im.opacity ?? 1
    ctx.translate(cx, cy)
    if (im.rotation) ctx.rotate((im.rotation * Math.PI) / 180)
    if (im.mirror) ctx.scale(-1, 1)
    if (img) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else {
      // Yükleniyor — kesikli çerçeve
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = COLORS.selection
      ctx.setLineDash([4, 3])
      ctx.strokeRect(-w / 2, -h / 2, w, h)
      ctx.setLineDash([])
    }
    ctx.restore()
  }
}

function drawComponentSilk(
  ctx: CanvasRenderingContext2D,
  s: RenderState,
  comp: ComponentInstance,
  fp: Footprint,
  side: CopperLayer
) {
  const { view } = s
  const color = side === 'top' ? COLORS.topSilk : COLORS.bottomSilk
  ctx.strokeStyle = color
  ctx.fillStyle = color

  for (const el of fp.silk) {
    if (el.kind === 'line') {
      const a = worldToScreen(view, localToWorld(comp, { x: el.x1, y: el.y1 }))
      const b = worldToScreen(view, localToWorld(comp, { x: el.x2, y: el.y2 }))
      ctx.lineWidth = Math.max(1, el.width * view.scale)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    } else if (el.kind === 'circle') {
      const c = worldToScreen(view, localToWorld(comp, { x: el.cx, y: el.cy }))
      ctx.lineWidth = Math.max(1, el.width * view.scale)
      ctx.beginPath()
      ctx.arc(c.x, c.y, el.r * view.scale, 0, Math.PI * 2)
      ctx.stroke()
    } else if (el.kind === 'arc') {
      const c = worldToScreen(view, localToWorld(comp, { x: el.cx, y: el.cy }))
      const [wa0, wa1] = transformArcAngles(el.a0, el.a1, comp)
      ctx.lineWidth = Math.max(1, el.width * view.scale)
      ctx.beginPath()
      ctx.arc(c.x, c.y, el.r * view.scale, wa0, wa1)
      ctx.stroke()
    } else {
      const anchor = localToWorld(comp, { x: el.x, y: el.y })
      const { strokes, strokeWidth } = placeText(
        el.text,
        anchor,
        el.size,
        comp.rotation,
        comp.side === 'bottom'
      )
      ctx.lineWidth = Math.max(1, strokeWidth * view.scale)
      for (const poly of strokes) {
        ctx.beginPath()
        const p0 = worldToScreen(view, poly[0])
        ctx.moveTo(p0.x, p0.y)
        for (const p of poly.slice(1)) {
          const sp = worldToScreen(view, p)
          ctx.lineTo(sp.x, sp.y)
        }
        ctx.stroke()
      }
    }
  }

  // Silk pin adları — pad'in içine yazı (varsayılan pin gösterimi)
  if (s.project.settings.pinSilkLabels !== false) {
    for (const lbl of pinSilkLabels(fp)) {
      const anchor = localToWorld(comp, { x: lbl.x, y: lbl.y })
      const { strokes, strokeWidth } = placeText(
        lbl.text, anchor, lbl.size, comp.rotation, comp.side === 'bottom', lbl.align
      )
      ctx.lineWidth = Math.max(1, strokeWidth * view.scale)
      for (const poly of strokes) {
        ctx.beginPath()
        const p0 = worldToScreen(view, poly[0])
        ctx.moveTo(p0.x, p0.y)
        for (const p of poly.slice(1)) {
          const sp = worldToScreen(view, p)
          ctx.lineTo(sp.x, sp.y)
        }
        ctx.stroke()
      }
    }
  }

  // RefDes etiketi — her zaman okunur yönde, gövdenin üstünde
  if (comp.refDes) {
    const bbox = componentBBox(comp, fp)
    const { strokes, strokeWidth } = placeText(
      comp.refDes,
      { x: bbox.x + bbox.width / 2, y: bbox.y - 1.2 },
      1.1,
      0,
      false
    )
    ctx.lineWidth = Math.max(1, strokeWidth * view.scale)
    for (const poly of strokes) {
      ctx.beginPath()
      const p0 = worldToScreen(view, poly[0])
      ctx.moveTo(p0.x, p0.y)
      for (const p of poly.slice(1)) {
        const sp = worldToScreen(view, p)
        ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
    }
  }
}

/** Pad adları (pad üstünde) ve atanmış netler (pad altında, sarı) */
function drawPadLabels(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project } = s
  const fontPx = Math.min(13, Math.max(8, view.scale * 0.5))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Silk pin adları kapalıyken ad zaten burada (pad içi) gösterilir. Açıkken de
  // -- pinSilkShowOnPad ayarı kapatılmadıkça -- ad pad içinde silk yazısına ek
  // olarak gösterilir; ayar kapalıysa yalnızca silk yazısı (pad yanı) görünür.
  const showName =
    s.project.settings.pinSilkLabels === false || s.project.settings.pinSilkShowOnPad !== false

  for (const comp of project.components) {
    if (comp.side === 'top' && !s.visibleLayers.top && !s.visibleLayers['top-silk']) continue
    if (comp.side === 'bottom' && !s.visibleLayers.bottom && !s.visibleLayers['bottom-silk']) continue
    const fp = s.getFootprint(comp.footprintId)
    if (!fp) continue
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      const pos = worldToScreen(view, padWorldPos(comp, pad))
      const { height } = padWorldSize(comp, pad)
      // Pad adı — pad'in üstünde, koyu zemin üzerinde
      if (showName) {
        ctx.font = `${fontPx}px system-ui, sans-serif`
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        const nameW = ctx.measureText(pad.name).width
        ctx.fillRect(pos.x - nameW / 2 - 2, pos.y - fontPx / 2 - 1, nameW + 4, fontPx + 2)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(pad.name, pos.x, pos.y)
      }
      // Net etiketi — pad'in altında sarı
      const net = comp.padNets[pad.name]
      if (net) {
        ctx.font = `bold ${fontPx * 0.9}px system-ui, sans-serif`
        ctx.fillStyle = COLORS.ratsnest
        ctx.fillText(net, pos.x, pos.y + (height / 2) * view.scale + fontPx * 0.7)
      }
    }
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

/** Kart dış hattının kapalı poligonu (dünya mm) — etiket sığdırma kontrolleri için */
function boardPolygonWorld(project: Project): Point[] {
  const ed = boardEditablePolygon(project.board)
  return filletPolygon(ed.points, ed.radii, 6)
}

/** Noktanın poligon kenarlarına en kısa mesafesi */
function distToPolygonEdge(p: Point, poly: Point[]): number {
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < min) min = d
  }
  return min
}

/**
 * Pad adlarını pad'in yanına yerleştirir — tercihen KART İÇİNE doğru:
 *  - Varsayılan yön komponent merkezinden dışa doğrudur (gövdeye binmesin);
 *  - ama etiket bu yönde kart dış hattına taşacak/temas edecekse, aynı sıradaki
 *    (aynı yön grubundaki) TÜM etiketler simetrik biçimde içeri çevrilir.
 *  - Etiketler birbirine ve kart çizgisine binmez (aç-gözlü çakışma önleme).
 */
function drawPadLabelsOutside(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project } = s
  // Kapalıysa: yer olmasa da (çakışsa/dışarı taşsa da) etiketler her zaman gösterilir.
  // Açıksa (varsayılan): sığmayan bileşenlerin TÜM pin adları birlikte gizlenir.
  const autoHide = project.settings.padLabelAutoHideCrowded !== false
  const fontPx = Math.min(12, Math.max(8, view.scale * 0.9))
  ctx.font = `${fontPx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const drawn: { x: number; y: number; w: number; h: number }[] = []
  const overlaps = (r: { x: number; y: number; w: number; h: number }) =>
    drawn.some(
      (d) =>
        Math.abs(d.x - r.x) * 2 < d.w + r.w + 2 &&
        Math.abs(d.y - r.y) * 2 < d.h + r.h + 2
    )

  // Kart poligonu (dünya mm) — etiketin karta sığıp sığmadığı kontrolü
  const boardPoly = boardPolygonWorld(project)
  const marginMm = (project.board.outlineWidth ?? 0.3) / 2 + 0.15
  /** Ekran-uzayı etiket dikdörtgeni kartın içinde (kenara değmeden) mi? */
  const insideBoard = (r: { x: number; y: number; w: number; h: number }): boolean => {
    if (boardPoly.length < 3) return true
    const corners: Point[] = [
      { x: r.x - r.w / 2, y: r.y - r.h / 2 },
      { x: r.x + r.w / 2, y: r.y - r.h / 2 },
      { x: r.x + r.w / 2, y: r.y + r.h / 2 },
      { x: r.x - r.w / 2, y: r.y + r.h / 2 }
    ].map((c) => screenToWorld(view, c))
    return corners.every(
      (c) => pointInPolygon(c, boardPoly) && distToPolygonEdge(c, boardPoly) >= marginMm
    )
  }

  const drawOne = (rect: { x: number; y: number; w: number; h: number }, text: string) => {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fillRect(rect.x - rect.w / 2, rect.y - rect.h / 2, rect.w, rect.h)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, rect.x, rect.y)
    drawn.push(rect)
  }

  for (const comp of project.components) {
    if (comp.side === 'top' && !s.visibleLayers.top && !s.visibleLayers['top-silk']) continue
    if (comp.side === 'bottom' && !s.visibleLayers.bottom && !s.visibleLayers['bottom-silk']) continue
    const fp = s.getFootprint(comp.footprintId)
    if (!fp) continue
    const bb = componentBBox(comp, fp)
    const center = worldToScreen(view, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 })
    // Yalnızca kullanıcı tanımlı (özel) footprint'lerde, footprint editöründe
    // elle belirlenmiş etiket konumu varsa onu kullan (ayar açıksa)
    const respectCustomPos =
      project.settings.padLabelRespectCustomFootprintPos !== false && !builtinFootprintIds.has(fp.id)
    // Yön karşılaştırmasını bbox yarı-genişlik/yarı-yükseklikle normalize et:
    // uzun-dar (iki kolonlu DIP gibi) gövdelerde uçtaki pad'ler merkeze
    // uzaklık yüzünden yanlışlıkla üst/alt yöne kaymasın — kendi kolonunda kalsın
    const halfW = Math.max(bb.width / 2, 0.001) * view.scale
    const halfH = Math.max(bb.height / 2, 0.001) * view.scale

    // 1. geçiş: pad başına yön (baskın eksene yaslanır → sıralar simetrik ve
    // hizalı görünür) + boyutlar; yön grubuna ayır
    interface Cand {
      pad: import('../types').PadDef
      pos: Point
      padHalf: number
      dx: number
      dy: number
      w: number
      h: number
      key: string
    }
    const cands: Cand[] = []
    // Footprint editöründe elle konumlanmış etiketler (ayar açıksa); bunlar da
    // diğerleriyle AYNI "sığıyor mu" kontrolüne tabidir — bileşenin geri kalanı
    // sığmıyorsa bunlar da birlikte gizlenir (istisna yok)
    const customRects: { rect: { x: number; y: number; w: number; h: number }; name: string }[] = []
    for (const pad of fp.pads) {
      if (pad.name.startsWith('MH')) continue
      // Footprint editöründe etiket konumu ELLE belirlendiyse (ve ayar açıksa) orayı kullan
      if (respectCustomPos && (pad.nameDx !== undefined || pad.nameDy !== undefined)) {
        const lp = worldToScreen(
          view,
          localToWorld(comp, { x: pad.x + (pad.nameDx ?? 0), y: pad.y + (pad.nameDy ?? 0) })
        )
        const w = ctx.measureText(pad.name).width + 6
        const h = fontPx + 4
        customRects.push({ rect: { x: lp.x, y: lp.y, w, h }, name: pad.name })
        continue
      }
      const pos = worldToScreen(view, padWorldPos(comp, pad))
      const size = padWorldSize(comp, pad)
      const padHalf = (Math.max(size.width, size.height) / 2) * view.scale
      let dx = pos.x - center.x
      let dy = pos.y - center.y
      if (Math.hypot(dx, dy) < 0.001) { dx = 0; dy = -1 }
      // Baskın eksene yasla (bbox oranına göre normalize) → iki kolonlu/tek
      // sıralı gövdelerde tüm pad'ler kendi kenarına hizalı kalır
      const ndx = dx / halfW
      const ndy = dy / halfH
      if (Math.abs(ndx) >= Math.abs(ndy)) { dx = Math.sign(dx) || 1; dy = 0 }
      else { dy = Math.sign(dy) || -1; dx = 0 }
      const w = ctx.measureText(pad.name).width + 6
      const h = fontPx + 4
      cands.push({ pad, pos, padHalf, dx, dy, w, h, key: `${dx},${dy}` })
    }

    // Grup (sıra) bazında ortak mesafe: en büyük pad yarıçapı → tüm etiketler
    // pad kenarından EŞİT uzaklıkta, kenar hizalı başlar
    const groupGap = new Map<string, number>()
    for (const c of cands) {
      groupGap.set(c.key, Math.max(groupGap.get(c.key) ?? 0, c.padHalf + 4))
    }
    // Grup karta sığmıyorsa (dış hattı aşar/değer) simetrik olarak içeri çevir
    const flipGroup = new Map<string, boolean>()
    for (const c of cands) {
      if (flipGroup.get(c.key)) continue
      const gapBase = groupGap.get(c.key)!
      const extent = c.dx !== 0 ? c.w : c.h
      const rect = {
        x: c.pos.x + c.dx * (gapBase + extent / 2),
        y: c.pos.y + c.dy * (gapBase + extent / 2),
        w: c.w,
        h: c.h
      }
      if (!insideBoard(rect)) flipGroup.set(c.key, true)
    }

    // 2. geçiş: yerleştir — grup içindeki HER pad aynı yönde + aynı mesafede
    // (kenar hizalı, tam eşit aralıklı). Yer yetersizse (çakışma/dışarı taşma)
    // parça göstermek yerine bileşenin TÜM pin adları birden gizlenir —
    // yarım/karışık etiketlenme yerine net "sığıyor / sığmıyor" davranışı
    const compRects: { rect: { x: number; y: number; w: number; h: number }; name: string }[] = []
    let compFits = true
    // NOT: aynı bileşenin kendi etiketleri birbiriyle de çakışabilir (ör. çok
    // pinli yoğun paketler) — bu yüzden `overlaps` hem önceki bileşenlerin
    // (drawn) hem de BU bileşenin şimdiye kadar toplanan etiketleriyle
    // (compRects) karşılaştırılır; yalnızca dışarıdan gelenlerle kıyaslamak
    // yoğun paketlerdeki iç içe geçmeyi kaçırırdı.
    const overlapsAny = (r: { x: number; y: number; w: number; h: number }) =>
      overlaps(r) ||
      compRects.some(
        (d) =>
          Math.abs(d.rect.x - r.x) * 2 < d.rect.w + r.w + 2 &&
          Math.abs(d.rect.y - r.y) * 2 < d.rect.h + r.h + 2
      )
    for (const c of cands) {
      const flipped = flipGroup.get(c.key) === true
      const gapBase = groupGap.get(c.key)!
      const dir = flipped ? { dx: -c.dx, dy: -c.dy } : { dx: c.dx, dy: c.dy }
      const extent = dir.dx !== 0 ? c.w : c.h
      const rect = {
        x: c.pos.x + dir.dx * (gapBase + extent / 2),
        y: c.pos.y + dir.dy * (gapBase + extent / 2),
        w: c.w,
        h: c.h
      }
      if (autoHide && (overlapsAny(rect) || !insideBoard(rect))) { compFits = false; break }
      compRects.push({ rect, name: c.pad.name })
    }
    if (compFits) {
      for (const cr of customRects) {
        if (autoHide && (overlapsAny(cr.rect) || !insideBoard(cr.rect))) { compFits = false; break }
        compRects.push(cr)
      }
    }
    if (compFits) for (const r of compRects) drawOne(r.rect, r.name)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

function drawSelection(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { view, project, selection } = s
  ctx.strokeStyle = COLORS.selection
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 3])

  for (const comp of project.components) {
    if (!selection.componentIds.includes(comp.id)) continue
    const fp = s.getFootprint(comp.footprintId)
    if (!fp) continue
    const bbox = componentBBox(comp, fp)
    const a = worldToScreen(view, { x: bbox.x, y: bbox.y })
    ctx.strokeRect(
      a.x - 3,
      a.y - 3,
      bbox.width * view.scale + 6,
      bbox.height * view.scale + 6
    )
  }

  ctx.setLineDash([])
  for (const trace of project.traces) {
    if (!selection.traceIds.includes(trace.id)) continue
    ctx.lineWidth = Math.max(2, trace.width * view.scale + 4)
    ctx.strokeStyle = 'rgba(63,211,220,0.4)'
    ctx.lineCap = 'round'
    ctx.beginPath()
    const p0 = worldToScreen(view, trace.points[0])
    ctx.moveTo(p0.x, p0.y)
    for (const p of trace.points.slice(1)) {
      const sp = worldToScreen(view, p)
      ctx.lineTo(sp.x, sp.y)
    }
    ctx.stroke()
  }

  // Tek iz seçiliyse köşe noktası tutamaçları (sürüklenebilir)
  if (selection.traceIds.length === 1) {
    const trace = project.traces.find((tr) => tr.id === selection.traceIds[0])
    if (trace) {
      const selIdx =
        s.selectedVertex && s.selectedVertex.traceId === trace.id
          ? s.selectedVertex.index
          : -1
      trace.points.forEach((p, i) => {
        const sp = worldToScreen(view, p)
        const isSel = i === selIdx
        const isEnd = i === 0 || i === trace.points.length - 1
        const r = isSel ? 5.5 : 4
        // Tek seçili nokta dolu cyan; uçlar hafif farklı; diğerleri beyaz
        ctx.fillStyle = isSel ? COLORS.selection : isEnd ? '#ffe08a' : '#ffffff'
        ctx.strokeStyle = isSel ? '#ffffff' : COLORS.selection
        ctx.lineWidth = isSel ? 2 : 1.5
        ctx.beginPath()
        ctx.rect(sp.x - r, sp.y - r, r * 2, r * 2)
        ctx.fill()
        ctx.stroke()
      })
    }
  }

  ctx.strokeStyle = COLORS.selection
  for (const via of project.vias) {
    if (!selection.viaIds.includes(via.id)) continue
    const p = worldToScreen(view, via)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, (via.diameter / 2) * view.scale + 3, 0, Math.PI * 2)
    ctx.stroke()
  }

  for (const t of project.texts) {
    if (!selection.textIds.includes(t.id)) continue
    const p = worldToScreen(view, t)
    ctx.strokeRect(p.x - 20, p.y - 10, 40, 20)
  }

  for (const z of project.zones) {
    if (!selection.zoneIds.includes(z.id)) continue
    ctx.lineWidth = 2
    ctx.beginPath()
    const zp0 = worldToScreen(view, z.points[0])
    ctx.moveTo(zp0.x, zp0.y)
    for (const p of z.points.slice(1)) {
      const sp = worldToScreen(view, p)
      ctx.lineTo(sp.x, sp.y)
    }
    ctx.closePath()
    ctx.stroke()
  }

  // Görsel seçimi — döndürülmüş çerçeve + köşe tutamaçları
  for (const im of project.images) {
    if (!selection.imageIds.includes(im.id)) continue
    const cx = (im.x + im.width / 2) * view.scale + view.x
    const cy = (im.y + im.height / 2) * view.scale + view.y
    const w = im.width * view.scale
    const h = im.height * view.scale
    ctx.save()
    ctx.translate(cx, cy)
    if (im.rotation) ctx.rotate((im.rotation * Math.PI) / 180)
    ctx.strokeStyle = COLORS.selection
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4)
    ctx.setLineDash([])
    // köşe tutamaçları
    ctx.fillStyle = '#ffffff'
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.fillRect(sx * (w / 2) - 3, sy * (h / 2) - 3, 6, 6)
      ctx.strokeRect(sx * (w / 2) - 3, sy * (h / 2) - 3, 6, 6)
    }
    ctx.restore()
  }
}
