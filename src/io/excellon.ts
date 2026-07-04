// ─── Excellon delik (drill) dosyası ───────────────────────────────────────
// PCB üreticileri ve CNC yazılımlarının kullandığı standart delik formatı.

import type { Footprint, Project } from '../types'
import { allDrills } from './exportGeometry'

export function excellonDrill(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const drills = allDrills(project, getFootprint)
  const boardH = project.board.height

  // Delikleri çapa göre grupla (takım listesi)
  const tools = new Map<string, { dia: number; holes: { x: number; y: number }[] }>()
  for (const d of drills) {
    const key = d.diameter.toFixed(3)
    if (!tools.has(key)) tools.set(key, { dia: d.diameter, holes: [] })
    tools.get(key)!.holes.push({ x: d.x, y: d.y })
  }
  const sorted = [...tools.values()].sort((a, b) => a.dia - b.dia)

  const lines: string[] = [
    'M48',
    '; CaYa PCB Studio — delik dosyasi',
    'METRIC,TZ',
    'FMAT,2'
  ]
  sorted.forEach((t, i) => {
    lines.push(`T${i + 1}C${t.dia.toFixed(3)}`)
  })
  lines.push('%', 'G90', 'G05')
  sorted.forEach((t, i) => {
    lines.push(`T${i + 1}`)
    for (const h of t.holes) {
      // Y ekseni çevrilir (Gerber ile aynı koordinat sistemi)
      lines.push(`X${h.x.toFixed(3)}Y${(boardH - h.y).toFixed(3)}`)
    }
  })
  lines.push('T0', 'M30')
  return lines.join('\n') + '\n'
}
