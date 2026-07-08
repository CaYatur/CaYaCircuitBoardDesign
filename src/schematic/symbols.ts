// ─── Standart devre şeması sembolleri ─────────────────────────────────────
// İki uçlu pasif bileşenler (direnç, kondansatör, diyot/LED, bobin, kristal)
// için standart şema glifleri üretir. Gliflerin uçları, kutu sembolüyle BİREBİR
// aynı pin uç/iç noktalarına oturur — böylece tel bağlama, net senkronu, isabet
// testi ve yakalama hiç değişmeden çalışır; yalnız görünüm değişir.
//
// Çok pinli bileşenler (IC, konnektör, modül, transistör) kutu olarak kalır —
// bu zaten standart şema gösterimidir.

import type { Footprint, Point, SymbolPrim } from '../types'
import { SCH_GRID, type SymbolLayout } from './model'

/** Çizim ilkeli — özel sembollerle (types.SymbolPrim) aynı biçim */
export type GlyphPrim = SymbolPrim

export type SymbolGlyph =
  | { kind: 'box' }
  | { kind: 'passive'; prims: GlyphPrim[] }
  | { kind: 'custom'; prims: GlyphPrim[] }

type PassiveKind =
  | 'resistor'
  | 'capacitor'
  | 'capacitor-polar'
  | 'diode'
  | 'led'
  | 'inductor'
  | 'crystal'
  | 'fuse'

/** Footprint'ten pasif sembol türünü çıkar (yoksa null → kutu). */
function passiveKind(fp: Footprint): PassiveKind | null {
  const pads = fp.pads.filter((p) => !p.name.startsWith('MH'))
  if (pads.length !== 2) return null
  const id = fp.id.toLowerCase()
  const name = (fp.name || '').toLowerCase()
  const cat = fp.category
  const has = (s: string) => id.includes(s) || name.includes(s)

  if (cat === 'Direnç' || has('direnç') || has('resistor')) {
    if (has('pot') || has('trim')) return null // 3 uçlu zaten
    return 'resistor'
  }
  if (cat === 'Kondansatör' || has('kondansat') || has('capacitor') || has('cap')) {
    const polar = pads.some((p) => p.name === '+' || p.name === '-') || has('elec') || has('tantal')
    return polar ? 'capacitor-polar' : 'capacitor'
  }
  if (cat === 'Diyot & LED' || has('diode') || has('diyot') || has('led')) {
    return has('led') ? 'led' : 'diode'
  }
  if (has('crystal') || has('kristal') || has('xtal')) return 'crystal'
  if (has('inductor') || has('bobin') || has('choke') || has('ferrite')) return 'inductor'
  if (has('fuse') || has('sigorta')) return 'fuse'
  return null
}

/**
 * Footprint için şema glifi. `layout` model.symbolLayout(fp) çıktısıdır.
 * Yalnız 2 uçlu pasifler için 'passive' döner; ötekiler 'box'.
 */
export function schematicGlyph(fp: Footprint, layout: SymbolLayout): SymbolGlyph {
  // Kullanıcının footprint editöründe çizdiği özel sembol her şeyi geçersiz kılar
  if (fp.symbol && fp.symbol.pins.length > 0) {
    return { kind: 'custom', prims: fp.symbol.prims }
  }
  const kind = passiveKind(fp)
  if (!kind) return { kind: 'box' }

  const left = layout.pins.find((p) => p.side === 'left')
  const right = layout.pins.find((p) => p.side === 'right')
  if (!left || !right) return { kind: 'box' }

  const xL = left.inner.x // sol iç uç
  const xR = right.inner.x // sağ iç uç
  const y = left.inner.y // ikisi de aynı y (2 uçlu → y=0)
  const cx = (xL + xR) / 2
  const span = xR - xL

  const prims: GlyphPrim[] = []
  const lead = (x1: number, x2: number) => prims.push({ k: 'line', x1, y1: y, x2, y2: y })

  switch (kind) {
    case 'resistor': {
      // ANSI zikzak
      const zw = Math.min(span * 0.62, 6.4)
      const bx0 = cx - zw / 2
      const bx1 = cx + zw / 2
      const amp = SCH_GRID * 0.5
      lead(xL, bx0)
      lead(bx1, xR)
      const n = 6
      const pts: Point[] = [{ x: bx0, y }]
      for (let i = 1; i < n; i++) {
        pts.push({ x: bx0 + (i * zw) / n, y: y + (i % 2 === 1 ? -amp : amp) })
      }
      pts.push({ x: bx1, y })
      prims.push({ k: 'poly', pts })
      break
    }
    case 'capacitor': {
      const gap = SCH_GRID * 0.55
      const plateH = SCH_GRID * 1.5
      lead(xL, cx - gap / 2)
      lead(cx + gap / 2, xR)
      prims.push({ k: 'line', x1: cx - gap / 2, y1: y - plateH / 2, x2: cx - gap / 2, y2: y + plateH / 2, w: 2.4 })
      prims.push({ k: 'line', x1: cx + gap / 2, y1: y - plateH / 2, x2: cx + gap / 2, y2: y + plateH / 2, w: 2.4 })
      break
    }
    case 'capacitor-polar': {
      const gap = SCH_GRID * 0.65
      const plateH = SCH_GRID * 1.5
      // Kutup: '+' pin'i düz plaka, '-' pin'i eğri plaka. K/-/+ tespiti:
      const leftPos = left.name === '+' || left.name === '1'
      const straightAt = leftPos ? cx - gap / 2 : cx + gap / 2
      const curvedAt = leftPos ? cx + gap / 2 : cx - gap / 2
      lead(xL, cx - gap / 2)
      lead(cx + gap / 2, xR)
      // düz plaka
      prims.push({ k: 'line', x1: straightAt, y1: y - plateH / 2, x2: straightAt, y2: y + plateH / 2, w: 2.4 })
      // eğri plaka (dışa bakan yay)
      const dir = curvedAt > straightAt ? 1 : -1
      const cr = plateH * 0.75
      const arcCx = curvedAt + dir * cr * 0.55
      prims.push({ k: 'arc', cx: arcCx, cy: y, r: cr, a0: dir > 0 ? Math.PI - 0.7 : -0.7, a1: dir > 0 ? Math.PI + 0.7 : 0.7 })
      // '+' işareti düz plaka tarafında
      prims.push({ k: 'plusminus', x: straightAt + (leftPos ? -1 : 1) * SCH_GRID * 0.55, y: y - plateH * 0.7, s: SCH_GRID * 0.4 })
      break
    }
    case 'diode':
    case 'led': {
      // Katot: 'K' pin'i tarafında. Üçgen katoda doğru bakar, bar katotta.
      const cathodeLeft = left.name === 'K' || left.name === '1'
      const triW = Math.min(span * 0.5, 4)
      const triH = SCH_GRID * 1.2
      const anodeX = cathodeLeft ? cx + triW / 2 : cx - triW / 2
      const cathodeX = cathodeLeft ? cx - triW / 2 : cx + triW / 2
      lead(xL, Math.min(anodeX, cathodeX))
      lead(Math.max(anodeX, cathodeX), xR)
      // üçgen (dolu) — taban anot tarafında, apex katot tarafında
      prims.push({
        k: 'poly',
        close: true,
        fill: true,
        pts: [
          { x: anodeX, y: y - triH / 2 },
          { x: anodeX, y: y + triH / 2 },
          { x: cathodeX, y }
        ]
      })
      // katot barı
      prims.push({ k: 'line', x1: cathodeX, y1: y - triH / 2, x2: cathodeX, y2: y + triH / 2, w: 2.4 })
      if (kind === 'led') {
        // iki ışıma oku
        const ox = cx + triW * 0.15
        for (const off of [0, 1]) {
          const ax = ox + off * SCH_GRID * 0.6
          const ay0 = y - triH * 0.7 - off * SCH_GRID * 0.2
          const ax2 = ax + SCH_GRID * 0.7
          const ay2 = ay0 - SCH_GRID * 0.7
          prims.push({ k: 'line', x1: ax, y1: ay0, x2: ax2, y2: ay2 })
          // ok başı
          prims.push({ k: 'poly', pts: [{ x: ax2 - 0.5, y: ay2 + 0.15 }, { x: ax2, y: ay2 }, { x: ax2 - 0.15, y: ay2 + 0.5 }] })
        }
      }
      break
    }
    case 'inductor': {
      // Yarım daire tümsekler
      const bumps = 4
      const bw = Math.min(span * 0.62, 6.8)
      const bx0 = cx - bw / 2
      const r = bw / (bumps * 2)
      lead(xL, bx0)
      lead(bx0 + bumps * 2 * r, xR)
      for (let i = 0; i < bumps; i++) {
        prims.push({ k: 'arc', cx: bx0 + r + i * 2 * r, cy: y, r, a0: Math.PI, a1: 0 })
      }
      break
    }
    case 'crystal': {
      const gap = SCH_GRID * 0.55
      const plateH = SCH_GRID * 1.5
      const bodyW = SCH_GRID * 0.7
      lead(xL, cx - gap / 2 - bodyW / 2)
      lead(cx + gap / 2 + bodyW / 2, xR)
      // iki plaka
      prims.push({ k: 'line', x1: cx - gap / 2 - bodyW / 2, y1: y - plateH / 2, x2: cx - gap / 2 - bodyW / 2, y2: y + plateH / 2, w: 2.4 })
      prims.push({ k: 'line', x1: cx + gap / 2 + bodyW / 2, y1: y - plateH / 2, x2: cx + gap / 2 + bodyW / 2, y2: y + plateH / 2, w: 2.4 })
      // ortadaki gövde dikdörtgeni
      prims.push({ k: 'poly', close: true, pts: [
        { x: cx - bodyW / 2, y: y - plateH * 0.4 },
        { x: cx + bodyW / 2, y: y - plateH * 0.4 },
        { x: cx + bodyW / 2, y: y + plateH * 0.4 },
        { x: cx - bodyW / 2, y: y + plateH * 0.4 }
      ] })
      break
    }
    case 'fuse': {
      // Dikdörtgen + orta çizgi
      const bw = Math.min(span * 0.6, 6)
      const bh = SCH_GRID * 0.9
      lead(xL, cx - bw / 2)
      lead(cx + bw / 2, xR)
      prims.push({ k: 'poly', close: true, pts: [
        { x: cx - bw / 2, y: y - bh / 2 },
        { x: cx + bw / 2, y: y - bh / 2 },
        { x: cx + bw / 2, y: y + bh / 2 },
        { x: cx - bw / 2, y: y + bh / 2 }
      ] })
      prims.push({ k: 'line', x1: cx - bw / 2, y1: y, x2: cx + bw / 2, y2: y })
      break
    }
  }

  return { kind: 'passive', prims }
}
