// ─── 3B sahne dışa aktarımı (OBJ + MTL) ───────────────────────────────────
// 3B görünümde üretilen sahne yüzeylerini (kart + bileşen gövdeleri + izler +
// içe aktarılmış modeller) Wavefront OBJ olarak yazar. Renkler MTL malzemeleri
// olarak gruplanır; çoğu 3B görüntüleyici/slicer doğrudan açabilir.

import type { Footprint, Project } from '../types'
import { buildScene } from '../render/render3d'

export interface SceneObjExport {
  obj: string
  mtl: string
  /** MTL dosyasının adı (OBJ içinden referanslanır) */
  mtlName: string
}

/** 'rgb(r,g,b)' → 0..1 float üçlüsü */
function parseRgb(color: string): [number, number, number] {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color.replace(/\s/g, ''))
  if (!m) return [0.6, 0.6, 0.6]
  return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255]
}

export function exportSceneObj(
  project: Project,
  getFootprint: (id: string) => Footprint | undefined,
  opts?: { showComponents?: boolean; showTraces?: boolean; showModels?: boolean }
): SceneObjExport {
  const faces = buildScene({
    project,
    getFootprint,
    showComponents: opts?.showComponents ?? true,
    showTraces: opts?.showTraces ?? true,
    showModels: opts?.showModels ?? true
  })

  const safe = (project.name || 'kart').replace(/[^\w\-]+/g, '_')
  const mtlName = `${safe}_3d.mtl`

  // Renk → malzeme
  const matIndex = new Map<string, number>()
  const matColors: [number, number, number][] = []
  for (const f of faces) {
    if (!matIndex.has(f.color)) {
      matIndex.set(f.color, matColors.length)
      matColors.push(parseRgb(f.color))
    }
  }

  const objLines: string[] = [
    `# CaYa PCB Studio — 3B sahne dışa aktarımı`,
    `# ${project.name}`,
    `mtllib ${mtlName}`,
    `o ${safe}`
  ]
  // Köşe noktaları (yüz sırasıyla; OBJ 1-indeksli)
  let vCount = 0
  const faceChunks: { mat: number; idx: number[] }[] = []
  for (const f of faces) {
    const idx: number[] = []
    for (const p of f.pts) {
      objLines.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`)
      vCount++
      idx.push(vCount)
    }
    faceChunks.push({ mat: matIndex.get(f.color)!, idx })
  }
  // Yüzler — malzeme değişince usemtl yaz
  let curMat = -1
  for (const fc of faceChunks) {
    if (fc.mat !== curMat) {
      objLines.push(`usemtl m${fc.mat}`)
      curMat = fc.mat
    }
    objLines.push(`f ${fc.idx.join(' ')}`)
  }

  const mtlLines: string[] = [`# CaYa PCB Studio — malzemeler`]
  matColors.forEach((c, i) => {
    mtlLines.push(`newmtl m${i}`)
    mtlLines.push(`Kd ${c[0].toFixed(4)} ${c[1].toFixed(4)} ${c[2].toFixed(4)}`)
    mtlLines.push(`Ka 0 0 0`)
    mtlLines.push(`Ks 0.05 0.05 0.05`)
    mtlLines.push(`d 1`)
  })

  return { obj: objLines.join('\n'), mtl: mtlLines.join('\n'), mtlName }
}
