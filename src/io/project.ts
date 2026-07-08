// ─── Proje dosyası ve footprint kütüphanesi içe/dışa aktarımı ─────────────
// Proje: .cayapcb (JSON). Footprint kütüphanesi: .cayalib (JSON).

import type { Footprint, Project } from '../types'
import { DEFAULT_PCB_COLOR, defaultConnectionFollow, newProject } from '../types'
import { pickTextFile, saveTextFile } from './files'
import { native } from './native'
import { sanitize } from './gerber'

/**
 * Projeyi kaydet. Masaüstünde konum bir kez seçilince hatırlanır ve sonraki
 * "Kaydet"ler doğrudan o yola yazar; `saveAs` ile "Farklı Kaydet".
 * Dönüş: başarılıysa { path } (web'de path null), iptal/başarısızsa null.
 */
export async function saveProjectFile(
  project: Project,
  opts: { path?: string | null; saveAs?: boolean } = {}
): Promise<{ path: string | null } | null> {
  const content = JSON.stringify(project, null, 2)
  const n = native()
  if (n) {
    const res = await n.saveProject({
      path: opts.path ?? undefined,
      defaultName: `${sanitize(project.name)}.cayapcb`,
      content,
      saveAs: opts.saveAs
    })
    if (res.error) throw new Error(res.error)
    if (res.canceled || !res.path) return null
    return { path: res.path }
  }
  // Web: konum/indirme (yol hatırlanamaz)
  const ok = await saveTextFile(`${sanitize(project.name)}.cayapcb`, content, 'application/json')
  return ok ? { path: null } : null
}

/**
 * Proje aç. `path` verilirse (son kullanılanlardan) doğrudan okur; yoksa diyalog.
 * Dönüş: { project, path } veya iptal/başarısızsa null.
 */
export async function openProjectFile(
  opts: { path?: string } = {}
): Promise<{ project: Project; path: string | null } | null> {
  const n = native()
  if (n) {
    const res = await n.openProject({ path: opts.path })
    if (res.error) throw new Error(res.error)
    if (res.canceled || !res.content) return null
    return { project: validateProject(JSON.parse(res.content)), path: res.path ?? null }
  }
  const file = await pickTextFile('.cayapcb,.json')
  if (!file) return null
  return { project: validateProject(JSON.parse(file.content)), path: null }
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
    models3d: Array.isArray(raw.models3d) ? raw.models3d : [],
    customFootprints: Array.isArray(raw.customFootprints) ? raw.customFootprints : [],
    schematic: {
      symbols: Array.isArray(raw.schematic?.symbols) ? raw.schematic.symbols : [],
      wires: Array.isArray(raw.schematic?.wires) ? raw.schematic.wires : [],
      // Şema senkron provenansı (tel kaynaklı pin atamaları) — varsa koru
      ...(raw.schematic?.pinNets && typeof raw.schematic.pinNets === 'object'
        ? { pinNets: raw.schematic.pinNets }
        : {})
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
  // Kart dış hattı çizgi kalınlığı yoksa varsayılan
  if (typeof project.board.outlineWidth !== 'number' || project.board.outlineWidth <= 0) {
    project.board.outlineWidth = 0.3
  }
  // Bağlantı takibi ayarı yoksa varsayılanlarla tamamla (kısmi objeleri de birleştir)
  project.settings.connectionFollow = {
    ...defaultConnectionFollow(),
    ...(raw.settings?.connectionFollow ?? {})
  }
  if (typeof project.settings.warnOnUnsavedClose !== 'boolean') {
    project.settings.warnOnUnsavedClose = true
  }
  // Eski tek "clearNetsOnPathDelete" ayarını yeni iki ayrı ayara göç ettir:
  // şema tarafı eski değeri (yoksa açık), PCB tarafı ise yeni varsayılan (kapalı).
  const legacyClear = (raw.settings as any)?.clearNetsOnPathDelete
  if (typeof project.settings.clearNetsOnPathDeleteSchematic !== 'boolean') {
    project.settings.clearNetsOnPathDeleteSchematic =
      typeof legacyClear === 'boolean' ? legacyClear : true
  }
  if (typeof project.settings.clearNetsOnPathDeletePcb !== 'boolean') {
    project.settings.clearNetsOnPathDeletePcb = false
  }
  if (typeof project.settings.removePcbTracesOnSchematicChange !== 'boolean') {
    project.settings.removePcbTracesOnSchematicChange = true
  }
  if (!['off', 'zoomed-out', 'always'].includes(project.settings.padLabelMode)) {
    project.settings.padLabelMode = 'off'
  }
  if (typeof project.settings.pinSilkLabels !== 'boolean') {
    project.settings.pinSilkLabels = true
  }
  if (typeof project.settings.pinSilkShowOnPad !== 'boolean') {
    project.settings.pinSilkShowOnPad = true
  }
  if (typeof project.settings.padLabelRespectCustomFootprintPos !== 'boolean') {
    project.settings.padLabelRespectCustomFootprintPos = true
  }
  if (typeof project.settings.padLabelAutoHideCrowded !== 'boolean') {
    project.settings.padLabelAutoHideCrowded = true
  }
  delete (project.settings as any).clearNetsOnPathDelete
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
      layer: ['top', 'bottom', 'both'].includes(p.layer) ? p.layer : 'both',
      ...(Number.isFinite(p.nameDx) ? { nameDx: Number(p.nameDx) } : {}),
      ...(Number.isFinite(p.nameDy) ? { nameDy: Number(p.nameDy) } : {})
    })),
    silk: Array.isArray(raw.silk) ? raw.silk : [],
    ...(Array.isArray(raw.outline)
      ? { outline: raw.outline.map((p: any) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) }
      : {}),
    // Özel şema sembolü ve 3B model — varsa aynen taşı
    ...(raw.symbol && Array.isArray(raw.symbol.pins) && Array.isArray(raw.symbol.prims)
      ? { symbol: raw.symbol }
      : {}),
    ...(raw.model3d && (raw.model3d.kind === 'param' || raw.model3d.kind === 'mesh')
      ? { model3d: raw.model3d }
      : {}),
    body: {
      x: Number(raw.body?.x) || -5,
      y: Number(raw.body?.y) || -5,
      width: Number(raw.body?.width) || 10,
      height: Number(raw.body?.height) || 10
    },
    custom: true
  }
}
