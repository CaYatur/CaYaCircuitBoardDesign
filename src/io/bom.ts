// ─── Malzeme listesi (BOM) ve dizgi (Pick & Place) dışa aktarımı ──────────

import type { Footprint, Project } from '../types'

const csvEscape = (s: string): string =>
  /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s

/** Malzeme listesi CSV — değer+footprint bazında gruplu */
export function bomCsv(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const groups = new Map<
    string,
    { value: string; footprint: string; refs: string[] }
  >()
  for (const comp of project.components) {
    const fp = getFootprint(comp.footprintId)
    const fpName = fp?.name ?? comp.footprintId
    const key = `${comp.value}||${fpName}`
    if (!groups.has(key)) {
      groups.set(key, { value: comp.value, footprint: fpName, refs: [] })
    }
    groups.get(key)!.refs.push(comp.refDes)
  }

  const rows = [['Adet', 'Referanslar', 'Değer', 'Kılıf/Footprint']]
  const sorted = [...groups.values()].sort((a, b) =>
    a.refs[0].localeCompare(b.refs[0], undefined, { numeric: true })
  )
  for (const g of sorted) {
    g.refs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    rows.push([String(g.refs.length), g.refs.join(', '), g.value, g.footprint])
  }
  return rows.map((r) => r.map(csvEscape).join(';')).join('\n') + '\n'
}

/** Dizgi makinesi (Pick & Place) CSV */
export function pickAndPlaceCsv(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const rows = [['Referans', 'Değer', 'Footprint', 'X(mm)', 'Y(mm)', 'Rotasyon', 'Yüz']]
  const boardH = project.board.height
  const sorted = [...project.components].sort((a, b) =>
    a.refDes.localeCompare(b.refDes, undefined, { numeric: true })
  )
  for (const comp of sorted) {
    const fp = getFootprint(comp.footprintId)
    rows.push([
      comp.refDes,
      comp.value,
      fp?.name ?? comp.footprintId,
      comp.x.toFixed(3),
      (boardH - comp.y).toFixed(3), // Y yukarı pozitif
      String(comp.rotation),
      comp.side === 'top' ? 'Üst' : 'Alt'
    ])
  }
  return rows.map((r) => r.map(csvEscape).join(';')).join('\n') + '\n'
}
