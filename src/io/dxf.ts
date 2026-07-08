// ─── DXF (mekanik CAD) dışa aktarımı ──────────────────────────────────────
// Kart dış hattı + iç kesimler + delikler; mekanik tasarım (SolidWorks,
// Fusion 360, AutoCAD, LibreCAD…) ve CNC/lazer iş akışları için. Basit,
// evrensel uyumlu DXF R12 (LINE + CIRCLE) çıktısı. DXF Y ekseni yukarı
// pozitif olduğundan y' = kartYüksekliği - y dönüşümü uygulanır.

import type { Footprint, Point, Project } from '../types'
import { allDrills, outlinePoints } from './exportGeometry'
import { cutoutOutlinePoints } from '../core/boardGeometry'

const n = (v: number): string => v.toFixed(4)

export function dxfBoard(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined
): string {
  const H = project.board.height
  const fy = (v: number): number => H - v // Y'yi çevir (DXF yukarı pozitif)
  const ent: string[] = []

  const line = (a: Point, b: Point, layer: string): void => {
    ent.push(
      '0', 'LINE', '8', layer,
      '10', n(a.x), '20', n(fy(a.y)), '30', '0',
      '11', n(b.x), '21', n(fy(b.y)), '31', '0'
    )
  }
  const polyline = (pts: Point[], layer: string): void => {
    for (let i = 0; i + 1 < pts.length; i++) line(pts[i], pts[i + 1], layer)
  }
  const circle = (cx: number, cy: number, r: number, layer: string): void => {
    ent.push('0', 'CIRCLE', '8', layer, '10', n(cx), '20', n(fy(cy)), '30', '0', '40', n(r))
  }

  // Kart dış hattı (kapalı)
  polyline(outlinePoints(project), 'OUTLINE')

  // İç kesimler (yuva/pencere)
  for (const cut of project.board.cutouts ?? []) {
    polyline(cutoutOutlinePoints(cut), 'CUTOUTS')
  }

  // Delikler (pad delikleri + via + montaj delikleri)
  for (const dr of allDrills(project, getFootprint)) {
    circle(dr.x, dr.y, dr.diameter / 2, 'HOLES')
  }

  return [
    '0', 'SECTION', '2', 'ENTITIES',
    ...ent,
    '0', 'ENDSEC',
    '0', 'EOF', ''
  ].join('\n')
}
