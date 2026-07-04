// ─── Proje dosyası ve footprint kütüphanesi içe/dışa aktarımı ─────────────
// Proje: .cayapcb (JSON). Footprint kütüphanesi: .cayalib (JSON).

import type { Footprint, Project } from '../types'
import { DEFAULT_PCB_COLOR, defaultConnectionFollow, newProject } from '../types'
import { pickTextFile, saveTextFile } from './files'
import { sanitize } from './gerber'

export async function saveProjectFile(project: Project): Promise<boolean> {
  const content = JSON.stringify(project, null, 2)
  return saveTextFile(`${sanitize(project.name)}.cayapcb`, content, 'application/json')
}

export async function openProjectFile(): Promise<Project | null> {
  const file = await pickTextFile('.cayapcb,.json')
  if (!file) return null
  const parsed = JSON.parse(file.content)
  return validateProject(parsed)
}

/** Eksik alanları varsayılanlarla tamamlayarak projeyi doğrula */
export function validateProject(raw: any): Project {
  if (!raw || typeof raw !== 'object' || !raw.board) {
    throw new Error('Geçersiz proje dosyası: kart bilgisi bulunamadı')
  }
  const base = newProject(typeof raw.name === 'string' ? raw.name : 'İsimsiz')
  const project: Project = {
    ...base,
    ...raw,
    formatVersion: 1,
    board: { ...base.board, ...raw.board },
    rules: { ...base.rules, ...(raw.rules ?? {}) },
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    components: Array.isArray(raw.components) ? raw.components : [],
    traces: Array.isArray(raw.traces) ? raw.traces : [],
    vias: Array.isArray(raw.vias) ? raw.vias : [],
    texts: Array.isArray(raw.texts) ? raw.texts : [],
    zones: Array.isArray(raw.zones) ? raw.zones : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    customFootprints: Array.isArray(raw.customFootprints) ? raw.customFootprints : [],
    schematic: {
      symbols: Array.isArray(raw.schematic?.symbols) ? raw.schematic.symbols : [],
      wires: Array.isArray(raw.schematic?.wires) ? raw.schematic.wires : []
    }
  }
  // Eski projelerde katman sayısı yoksa çift katman varsay
  if (project.board.layerCount !== 1 && project.board.layerCount !== 2) {
    project.board.layerCount = 2
  }
  // Eski projelerde PCB rengi yoksa varsayılan yeşil
  if (typeof project.board.color !== 'string') {
    project.board.color = DEFAULT_PCB_COLOR
  }
  // Bağlantı takibi ayarı yoksa varsayılanlarla tamamla (kısmi objeleri de birleştir)
  project.settings.connectionFollow = {
    ...defaultConnectionFollow(),
    ...(raw.settings?.connectionFollow ?? {})
  }
  if (typeof project.settings.warnOnUnsavedClose !== 'boolean') {
    project.settings.warnOnUnsavedClose = true
  }
  // Komponentlerin padNets alanı olduğundan emin ol
  for (const c of project.components) {
    if (!c.padNets || typeof c.padNets !== 'object') c.padNets = {}
  }
  return project
}

// ─── Footprint kütüphanesi ────────────────────────────────────────────────

export interface FootprintLibraryFile {
  format: 'caya-footprint-library'
  version: 1
  exportedAt: string
  footprints: Footprint[]
}

export async function exportFootprintLibrary(
  footprints: Footprint[],
  name = 'kutuphane'
): Promise<boolean> {
  const lib: FootprintLibraryFile = {
    format: 'caya-footprint-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    footprints
  }
  return saveTextFile(
    `${sanitize(name)}.cayalib`,
    JSON.stringify(lib, null, 2),
    'application/json'
  )
}

export async function importFootprintLibrary(): Promise<Footprint[] | null> {
  const file = await pickTextFile('.cayalib,.json')
  if (!file) return null
  const parsed = JSON.parse(file.content)
  const list: any[] = Array.isArray(parsed)
    ? parsed
    : parsed?.footprints
  if (!Array.isArray(list)) {
    throw new Error('Geçersiz kütüphane dosyası')
  }
  const footprints: Footprint[] = []
  for (const raw of list) {
    footprints.push(validateFootprint(raw))
  }
  return footprints
}

export function validateFootprint(raw: any): Footprint {
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.pads)) {
    throw new Error(`Geçersiz footprint: ${raw?.name ?? raw?.id ?? '?'}`)
  }
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    description: typeof raw.description === 'string' ? raw.description : '',
    category: typeof raw.category === 'string' ? raw.category : 'Özel',
    pads: raw.pads.map((p: any) => ({
      name: String(p.name ?? '?'),
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      shape: ['circle', 'rect', 'oval'].includes(p.shape) ? p.shape : 'circle',
      width: Number(p.width) || 1,
      height: Number(p.height) || 1,
      ...(p.drill ? { drill: Number(p.drill) } : {}),
      layer: ['top', 'bottom', 'both'].includes(p.layer) ? p.layer : 'both'
    })),
    silk: Array.isArray(raw.silk) ? raw.silk : [],
    body: {
      x: Number(raw.body?.x) || -5,
      y: Number(raw.body?.y) || -5,
      width: Number(raw.body?.width) || 10,
      height: Number(raw.body?.height) || 10
    },
    custom: true
  }
}
