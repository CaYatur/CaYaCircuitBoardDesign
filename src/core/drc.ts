// ─── DRC: Tasarım Kuralı Denetimi ─────────────────────────────────────────
// Boşluk (clearance) ihlalleri, minimum iz genişliği, via kuralları,
// kart kenarı mesafesi, kısa devreler ve eksik bağlantılar denetlenir.

import type { DrcViolation, Footprint, Project } from '../types'
import { uid } from '../types'
import { capsuleGap, componentBBox, rectsOverlap } from './geometry'
import { analyzeNets } from './netlist'
import { t } from '../i18n'

export function runDrc(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): DrcViolation[] {
  const violations: DrcViolation[] = []
  const rules = project.rules
  const analysis = analyzeNets(project, getFootprint)
  const { items, groupOf, resolvedNet } = analysis

  const add = (
    severity: 'error' | 'warning',
    message: string,
    x: number,
    y: number
  ) => violations.push({ id: uid('drc'), severity, message, x, y })

  // ── 1. Boşluk ihlalleri: temas etmeyen ama fazla yakın farklı-grup öğeler ──
  const layersOverlap = (a: string[], b: string[]) =>
    a.some((l) => b.includes(l))

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (groupOf[i] === groupOf[j]) continue // zaten bağlılar
      const a = items[i]
      const b = items[j]
      if (!a.capsule || !b.capsule) continue // zone boşlukları yapım gereği korunur
      if (!layersOverlap(a.layers, b.layers)) continue
      const gap = capsuleGap(a.capsule, b.capsule)
      if (gap < rules.clearance) {
        const netA = resolvedNet[i] || t('(atanmamış)')
        const netB = resolvedNet[j] || t('(atanmamış)')
        add(
          'error',
          t('Boşluk ihlali: {a} ↔ {b} arası {gap} mm < {min} mm ({na} / {nb})', {
            a: describe(a),
            b: describe(b),
            gap: gap.toFixed(3),
            min: rules.clearance,
            na: netA,
            nb: netB
          }),
          (a.x + b.x) / 2,
          (a.y + b.y) / 2
        )
      }
    }
  }

  // ── 2. Minimum iz genişliği ──
  for (const trace of project.traces) {
    if (trace.width < rules.minTraceWidth) {
      const p = trace.points[0]
      add(
        'error',
        t('İz genişliği {w} mm, minimum {min} mm kuralının altında', {
          w: trace.width,
          min: rules.minTraceWidth
        }),
        p.x,
        p.y
      )
    }
  }

  // ── 3. Via kuralları ──
  for (const via of project.vias) {
    if (via.drill < rules.minViaDrill) {
      add(
        'error',
        t('Via delik çapı {d} mm, minimum {min} mm altında', {
          d: via.drill,
          min: rules.minViaDrill
        }),
        via.x,
        via.y
      )
    }
    const ring = (via.diameter - via.drill) / 2
    if (ring < rules.minAnnularRing) {
      add(
        'error',
        t('Via halkası {r} mm, minimum {min} mm altında', {
          r: ring.toFixed(3),
          min: rules.minAnnularRing
        }),
        via.x,
        via.y
      )
    }
  }

  // ── 4. Kart kenarı mesafesi ──
  const bw = project.board.width
  const bh = project.board.height
  const edge = rules.edgeClearance
  for (let i = 0; i < items.length; i++) {
    const c = items[i].capsule
    if (!c) continue
    const minX = Math.min(c.x1, c.x2) - c.r
    const minY = Math.min(c.y1, c.y2) - c.r
    const maxX = Math.max(c.x1, c.x2) + c.r
    const maxY = Math.max(c.y1, c.y2) + c.r
    if (minX < edge || minY < edge || maxX > bw - edge || maxY > bh - edge) {
      add(
        maxX < 0 || minX > bw || maxY < 0 || minY > bh ? 'error' : 'warning',
        t('{item} kart kenarına {e} mm\'den yakın veya kart dışında', {
          item: describe(items[i]),
          e: edge
        }),
        items[i].x,
        items[i].y
      )
    }
  }

  // ── 5. Montaj deliği çevresinde bakır ──
  for (const hole of project.board.mountingHoles) {
    for (const it of items) {
      if (!it.capsule) continue
      const gap =
        capsuleGap(it.capsule, {
          x1: hole.x, y1: hole.y, x2: hole.x, y2: hole.y, r: hole.drill / 2
        })
      if (gap < rules.clearance) {
        add(
          'warning',
          t('{item} montaj deliğine çok yakın ({gap} mm)', {
            item: describe(it),
            gap: Math.max(0, gap).toFixed(3)
          }),
          hole.x,
          hole.y
        )
      }
    }
  }

  // ── 6. Kısa devreler ──
  for (const s of analysis.shorts) {
    let message: string
    if (s.kind === 'trace-pad') {
      const involved = s.nets.filter(Boolean)
      message = t('Kısa devre: iz {ref} pad\'inin üzerinden geçiyor{nets}', {
        ref: s.refs?.[0] ?? '?',
        nets: involved.length ? ' (' + involved.join(' ↔ ') + ')' : ''
      })
    } else if (s.kind === 'pad-pad') {
      message = t('Kısa devre: {a} ve {b} pad\'leri fiziksel çakışıyor', {
        a: s.refs?.[0] ?? '?',
        b: s.refs?.[1] ?? '?'
      })
    } else {
      message = t('Kısa devre: {nets} netleri birbirine değiyor', {
        nets: s.nets.filter(Boolean).join(' ↔ ')
      })
    }
    add('error', message, s.x, s.y)
  }

  // ── 7. Eksik bağlantılar (ratsnest) ──
  for (const aw of analysis.airwires) {
    add(
      'warning',
      t('Tamamlanmamış bağlantı: "{net}" neti ({p1}) ↔ ({p2})', {
        net: aw.net,
        p1: `${aw.x1.toFixed(1)},${aw.y1.toFixed(1)}`,
        p2: `${aw.x2.toFixed(1)},${aw.y2.toFixed(1)}`
      }),
      (aw.x1 + aw.x2) / 2,
      (aw.y1 + aw.y2) / 2
    )
  }

  // ── 8. Komponent gövde çakışması (aynı yüz) ──
  const comps = project.components
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      if (comps[i].side !== comps[j].side) continue
      const fa = getFootprint(comps[i].footprintId)
      const fb = getFootprint(comps[j].footprintId)
      if (!fa || !fb) continue
      const ra = componentBBox(comps[i], fa)
      const rb = componentBBox(comps[j], fb)
      if (rectsOverlap(ra, rb)) {
        add(
          'warning',
          t('Komponent çakışması: {a} ↔ {b}', {
            a: comps[i].refDes,
            b: comps[j].refDes
          }),
          (comps[i].x + comps[j].x) / 2,
          (comps[i].y + comps[j].y) / 2
        )
      }
    }
  }

  return violations
}

function describe(it: { kind: string; padName?: string }): string {
  switch (it.kind) {
    case 'pad': return `${t('pad')} ${it.padName ?? ''}`
    case 'trace': return t('iz')
    case 'via': return 'via'
    case 'zone': return t('bakır alan')
    default: return it.kind
  }
}
