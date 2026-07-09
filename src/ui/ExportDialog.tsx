// ─── Dışa aktarma dialogu ─────────────────────────────────────────────────
// Gerber, Excellon, SVG (lazer), G-code (CNC), PNG, BOM, dizgi — katman
// katman veya toplu.

import { useState } from 'react'
import { useStore } from '../state/store'
import type { CopperLayer, VisibleLayer } from '../types'
import { saveTextFile, saveFilesToDirectory, type ExportFile } from '../io/files'
import {
  gerberFileSet,
  gerberCopperLayer,
  gerberSolderMask,
  gerberSolderPaste,
  gerberSilkLayer,
  gerberOutline,
  sanitize
} from '../io/gerber'
import { excellonDrill } from '../io/excellon'
import {
  svgCopperLayer,
  svgSilkLayer,
  svgSolderPaste,
  svgSolderMask,
  svgAssembly,
  svgOutline,
  svgComposite,
  svgOutlineTraces,
  svgFullBoard,
  svgCustomExport,
  svgSideStack
} from '../io/svg'
import { dxfBoard } from '../io/dxf'
import {
  defaultGcodeOptions,
  gcodeDrill,
  gcodeIsolation,
  gcodeOutlineCut
} from '../io/gcode'
import { bomCsv, pickAndPlaceCsv } from '../io/bom'
import {
  exportCompositePng,
  exportLayerPng,
  compositePngBlob,
  layerPngBlob,
  exportOutlineTracesPng,
  outlineTracesPngBlob,
  exportSilkLayerPng,
  silkLayerPngBlob,
  exportCustomPng,
  exportSideStackPng,
  sideStackPngBlob
} from '../io/png'
import {
  exportSchematicPng,
  schematicSvgContent,
  schematicPngBlob
} from '../io/schematicImage'
import { saveProjectFile } from '../io/project'
import { useT } from '../i18n'

type Section = 'gerber' | 'svg' | 'gcode' | 'png' | 'docs' | 'custom'

const CUSTOM_LAYERS: { id: VisibleLayer; label: string }[] = [
  { id: 'top', label: 'Üst bakır' },
  { id: 'bottom', label: 'Alt bakır' },
  { id: 'zones', label: 'Bakır alanlar' },
  { id: 'top-silk', label: 'Üst silkscreen' },
  { id: 'bottom-silk', label: 'Alt silkscreen' },
  { id: 'drill', label: 'Delikler' },
  { id: 'outline', label: 'Kart sınırı' },
  { id: 'ratsnest', label: 'Ratsnest (hava telleri)' }
]

export function ExportDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const setStatus = useStore((s) => s.setStatus)
  const t = useT()
  const [section, setSection] = useState<Section>('gerber')
  const [busy, setBusy] = useState(false)

  // SVG seçenekleri
  const [svgMirror, setSvgMirror] = useState(true)
  const [svgNegative, setSvgNegative] = useState(false)

  // G-code seçenekleri
  const [gc, setGc] = useState(defaultGcodeOptions())

  // Özel dışa aktarım — katman seçimi (varsayılan: hepsi açık)
  const [customLayers, setCustomLayers] = useState<Record<VisibleLayer, boolean>>({
    top: true,
    bottom: true,
    'top-silk': true,
    'bottom-silk': true,
    zones: true,
    drill: true,
    outline: true,
    ratsnest: false
  })
  const [customBlackWhite, setCustomBlackWhite] = useState(true)

  if (activeDialog !== 'export') return null

  const base = sanitize(project.name)
  const singleLayer = project.board.layerCount === 1

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(true)
    try {
      await fn()
      setStatus(t('✓ {label} dışa aktarıldı', { label }))
    } catch (err: any) {
      setStatus(t('Dışa aktarma hatası: {err}', { err: err?.message ?? err }))
    } finally {
      setBusy(false)
    }
  }

  // Toplu dışa aktarım: tüm dosyaları seçilen tek bir klasöre yazar
  // (desteklenmiyorsa sıralı indirmeye düşer).
  const runBatch = async (build: () => ExportFile[] | Promise<ExportFile[]>) => {
    setBusy(true)
    try {
      const files = await build()
      const { count, failed } = await saveFilesToDirectory(files)
      if (count === 0 && failed.length === 0) {
        setStatus(t('Toplu dışa aktarma iptal edildi'))
      } else if (failed.length > 0) {
        setStatus(
          t('⚠ {n} dosya aktarıldı, {k} dosya yazılamadı (başka programda açık olabilir): {list}', {
            n: count,
            k: failed.length,
            list: failed.join(', ')
          })
        )
      } else {
        setStatus(t('✓ {n} dosya tek seferde dışa aktarıldı', { n: count }))
      }
    } catch (err: any) {
      setStatus(t('Dışa aktarma hatası: {err}', { err: err?.message ?? err }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⇩ {t('Dışa Aktar')} — {project.name}</h3>
          <button onClick={() => openDialog(null)}>✕</button>
        </div>

        <div className="tabs">
          <button className={section === 'gerber' ? 'active' : ''} onClick={() => setSection('gerber')}>
            {t('Gerber / Üretici')}
          </button>
          <button className={section === 'svg' ? 'active' : ''} onClick={() => setSection('svg')}>
            {t('SVG / Lazer')}
          </button>
          <button className={section === 'gcode' ? 'active' : ''} onClick={() => setSection('gcode')}>
            G-code / CNC
          </button>
          <button className={section === 'png' ? 'active' : ''} onClick={() => setSection('png')}>
            {t('PNG / Görsel')}
          </button>
          <button className={section === 'docs' ? 'active' : ''} onClick={() => setSection('docs')}>
            {t('BOM / Proje')}
          </button>
          <button className={section === 'custom' ? 'active' : ''} onClick={() => setSection('custom')}>
            {t('Özel Seçim')}
          </button>
        </div>

        {section === 'custom' && (
          <div className="export-body">
            <p>
              {t('İstediğiniz katmanları seçip TEK bir dosyada birleştirerek dışa aktarın (SVG veya PNG).')}
            </p>
            <div className="export-options custom-layer-grid">
              {CUSTOM_LAYERS.filter((l) => !singleLayer || (l.id !== 'bottom' && l.id !== 'bottom-silk')).map((l) => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    checked={customLayers[l.id]}
                    onChange={(e) => setCustomLayers({ ...customLayers, [l.id]: e.target.checked })}
                  />
                  {t(l.label)}
                </label>
              ))}
            </div>
            <div className="export-buttons">
              <button
                onClick={() => setCustomLayers(Object.fromEntries(CUSTOM_LAYERS.map((l) => [l.id, true])) as Record<VisibleLayer, boolean>)}
              >
                {t('Hepsini Seç')}
              </button>
              <button
                onClick={() => setCustomLayers(Object.fromEntries(CUSTOM_LAYERS.map((l) => [l.id, false])) as Record<VisibleLayer, boolean>)}
              >
                {t('Hiçbirini Seçme')}
              </button>
            </div>
            <div className="export-options">
              <label>
                <input
                  type="checkbox"
                  checked={customBlackWhite}
                  onChange={(e) => setCustomBlackWhite(e.target.checked)}
                />
                {t('Siyah-beyaz (tüm katmanları siyaha zorla)')}
              </label>
            </div>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  run(t('Özel dışa aktarım SVG'), () =>
                    saveTextFile(`${base}-ozel.svg`, svgCustomExport(project, getFootprint, customLayers, customBlackWhite), 'image/svg+xml').then(() => {})
                  )
                }
              >
                {t('SVG olarak indir')}
              </button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => run(t('Özel dışa aktarım PNG'), () => exportCustomPng(project, getFootprint, customLayers, customBlackWhite))}
              >
                {t('PNG olarak indir')}
              </button>
            </div>
          </div>
        )}

        {section === 'gerber' && (
          <div className="export-body">
            <p>
              {t('PCB üreticilerine (JLCPCB, PCBWay vb.) gönderilecek eksiksiz üretim seti: üst/alt bakır, lehim maskesi, lehim pastası (stencil), silkscreen, kart sınırı ve Excellon delik dosyası.')}
            </p>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runBatch(() => {
                    const files: ExportFile[] = gerberFileSet(project, getFootprint)
                    files.push({
                      name: `${base}.drl`,
                      content: excellonDrill(project, getFootprint)
                    })
                    files.push({
                      name: `${base}-mekanik.dxf`,
                      content: dxfBoard(project, getFootprint),
                      mime: 'application/dxf'
                    })
                    return files
                  })
                }
              >
                📦 {t('Tüm Gerber Setini Tek Klasöre Aktar ({n} dosya)', { n: (singleLayer ? 5 : 9) + 2 })}
              </button>
            </div>
            <h4>{t('Ayrı dosyalar')}:</h4>
            <div className="export-buttons">
              {(
                [
                  [t('Üst bakır') + ' (.gtl)', `${base}-F_Cu.gtl`, () => gerberCopperLayer(project, getFootprint, 'top')],
                  [t('Üst maske') + ' (.gts)', `${base}-F_Mask.gts`, () => gerberSolderMask(project, getFootprint, 'top')],
                  [t('Üst pasta') + ' (.gtp)', `${base}-F_Paste.gtp`, () => gerberSolderPaste(project, getFootprint, 'top')],
                  [t('Üst silk') + ' (.gto)', `${base}-F_Silk.gto`, () => gerberSilkLayer(project, getFootprint, 'top')],
                  ...(!singleLayer
                    ? ([
                        [t('Alt bakır') + ' (.gbl)', `${base}-B_Cu.gbl`, () => gerberCopperLayer(project, getFootprint, 'bottom')],
                        [t('Alt maske') + ' (.gbs)', `${base}-B_Mask.gbs`, () => gerberSolderMask(project, getFootprint, 'bottom')],
                        [t('Alt pasta') + ' (.gbp)', `${base}-B_Paste.gbp`, () => gerberSolderPaste(project, getFootprint, 'bottom')],
                        [t('Alt silk') + ' (.gbo)', `${base}-B_Silk.gbo`, () => gerberSilkLayer(project, getFootprint, 'bottom')]
                      ] as [string, string, () => string][])
                    : []),
                  [t('Kart sınırı') + ' (.gm1)', `${base}-Edge_Cuts.gm1`, () => gerberOutline(project)]
                ] as [string, string, () => string][]
              ).map(([label, fname, make]) => (
                <button
                  key={fname}
                  disabled={busy}
                  onClick={() => run(label, () => saveTextFile(fname, make()).then(() => {}))}
                >
                  {label}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Delik dosyası'), () =>
                    saveTextFile(`${base}.drl`, excellonDrill(project, getFootprint)).then(() => {})
                  )
                }
              >
                {t('Delikler')} (.drl)
              </button>
            </div>
            <h4>{t('Mekanik')}:</h4>
            <div className="export-buttons">
              <button
                disabled={busy}
                title={t('Kart dış hattı + iç kesimler + delikler — mekanik CAD (Fusion 360, SolidWorks, AutoCAD) ve CNC/lazer için')}
                onClick={() =>
                  run(t('DXF (mekanik)'), () =>
                    saveTextFile(`${base}-mekanik.dxf`, dxfBoard(project, getFootprint), 'application/dxf').then(() => {})
                  )
                }
              >
                📐 {t('DXF — dış hat + delikler')}
              </button>
            </div>
          </div>
        )}

        {section === 'svg' && (
          <div className="export-body">
            <p>
              {t('Lazer kesim, toner transfer ve film pozlama için gerçek ölçülü (mm) vektör çıktılar.')}
            </p>
            <div className="export-options">
              <label>
                <input
                  type="checkbox"
                  checked={svgMirror}
                  onChange={(e) => setSvgMirror(e.target.checked)}
                />
                {t('Aynala (toner transfer / alt katman için)')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={svgNegative}
                  onChange={(e) => setSvgNegative(e.target.checked)}
                />
                {t('Negatif (film pozlama)')}
              </label>
            </div>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runBatch(() => {
                    const files: ExportFile[] = [
                      {
                        name: `${base}-ust-bakir.svg`,
                        content: svgCopperLayer(project, getFootprint, 'top', {
                          mirror: svgMirror,
                          negative: svgNegative,
                          showDrills: true
                        }),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-ust-silk.svg`,
                        content: svgSilkLayer(project, getFootprint, 'top'),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-kesim.svg`,
                        content: svgOutline(project, getFootprint),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-birlesik.svg`,
                        content: svgComposite(project, getFootprint),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-tam-kart.svg`,
                        content: svgFullBoard(project, getFootprint),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-ust-yigin.svg`,
                        content: svgSideStack(project, getFootprint, 'top'),
                        mime: 'image/svg+xml'
                      },
                      {
                        name: `${base}-sema.svg`,
                        content: schematicSvgContent(project, getFootprint),
                        mime: 'image/svg+xml'
                      }
                    ]
                    if (!singleLayer) {
                      files.splice(1, 0, {
                        name: `${base}-alt-bakir.svg`,
                        content: svgCopperLayer(project, getFootprint, 'bottom', {
                          mirror: svgMirror,
                          negative: svgNegative,
                          showDrills: true
                        }),
                        mime: 'image/svg+xml'
                      })
                      files.push({
                        name: `${base}-alt-silk.svg`,
                        content: svgSilkLayer(project, getFootprint, 'bottom'),
                        mime: 'image/svg+xml'
                      })
                      files.push({
                        name: `${base}-alt-yigin.svg`,
                        content: svgSideStack(project, getFootprint, 'bottom'),
                        mime: 'image/svg+xml'
                      })
                    }
                    // Lehim pastası (stencil), lehim maskesi ve montaj çizimi
                    files.push(
                      { name: `${base}-ust-pasta.svg`, content: svgSolderPaste(project, getFootprint, 'top', { mirror: svgMirror }), mime: 'image/svg+xml' },
                      { name: `${base}-ust-maske.svg`, content: svgSolderMask(project, getFootprint, 'top', { mirror: svgMirror }), mime: 'image/svg+xml' },
                      { name: `${base}-ust-montaj.svg`, content: svgAssembly(project, getFootprint, 'top'), mime: 'image/svg+xml' }
                    )
                    if (!singleLayer) {
                      files.push(
                        { name: `${base}-alt-pasta.svg`, content: svgSolderPaste(project, getFootprint, 'bottom', { mirror: svgMirror }), mime: 'image/svg+xml' },
                        { name: `${base}-alt-maske.svg`, content: svgSolderMask(project, getFootprint, 'bottom', { mirror: svgMirror }), mime: 'image/svg+xml' },
                        { name: `${base}-alt-montaj.svg`, content: svgAssembly(project, getFootprint, 'bottom'), mime: 'image/svg+xml' }
                      )
                    }
                    return files
                  })
                }
              >
                📦 {t('Tüm SVG\'leri Tek Klasöre Aktar')}
              </button>
            </div>
            <div className="export-buttons">
              {(['top', 'bottom'] as CopperLayer[])
                .filter((l) => l === 'top' || !singleLayer)
                .map((layer) => (
                  <button
                    key={layer}
                    disabled={busy}
                    onClick={() =>
                      run(
                        layer === 'top' ? t('Üst bakır SVG') : t('Alt bakır SVG'),
                        () =>
                          saveTextFile(
                            `${base}-${layer === 'top' ? 'ust' : 'alt'}-bakir.svg`,
                            svgCopperLayer(project, getFootprint, layer, {
                              mirror: svgMirror,
                              negative: svgNegative,
                              showDrills: true
                            }),
                            'image/svg+xml'
                          ).then(() => {})
                      )
                    }
                  >
                    {layer === 'top' ? '▲ ' + t('Üst bakır') : '▼ ' + t('Alt bakır')} (SVG)
                  </button>
                ))}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Üst silkscreen SVG'), () =>
                    saveTextFile(
                      `${base}-ust-silk.svg`,
                      svgSilkLayer(project, getFootprint, 'top'),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                {t('Üst silkscreen')} (SVG)
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(t('Alt silkscreen SVG'), () =>
                      saveTextFile(
                        `${base}-alt-silk.svg`,
                        svgSilkLayer(project, getFootprint, 'bottom'),
                        'image/svg+xml'
                      ).then(() => {})
                    )
                  }
                >
                  {t('Alt silkscreen')} (SVG)
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Kesim hattı SVG'), () =>
                    saveTextFile(
                      `${base}-kesim.svg`,
                      svgOutline(project, getFootprint),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                ✂ {t('Kesim hattı — lazer')} (SVG)
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Birleşik görünüm SVG'), () =>
                    saveTextFile(
                      `${base}-birlesik.svg`,
                      svgComposite(project, getFootprint),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                🎨 {t('Birleşik görünüm')} (SVG)
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Dış hat + yollar (S/B) SVG'), () =>
                    saveTextFile(
                      `${base}-dishat-yollar.svg`,
                      svgOutlineTraces(project, getFootprint),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                🖊 {t('Kart dış hattı + yollar (S/B)')} (SVG)
              </button>
              <button
                disabled={busy}
                title={t('Dış çerçeve + yollar + pad\'ler + vialar + delikler + silkscreen yazılar — tek eksiksiz SVG')}
                onClick={() =>
                  run(t('Tam kart SVG'), () =>
                    saveTextFile(
                      `${base}-tam-kart.svg`,
                      svgFullBoard(project, getFootprint),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                🗺 {t('Tam Kart — her şey dahil')} (SVG)
              </button>
              <button
                disabled={busy}
                title={t('Üst bakır + üst bakır alanları + delikler + kart sınırı + üst silk + üst görseller — tam koyu S/B tek katman')}
                onClick={() =>
                  run(t('Üst yığın SVG'), () =>
                    saveTextFile(
                      `${base}-ust-yigin.svg`,
                      svgSideStack(project, getFootprint, 'top'),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                ▲ {t('Üst yığın — bakır+alan+delik+sınır (S/B)')} (SVG)
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  title={t('Alt bakır + alt bakır alanları + delikler + kart sınırı + alt silk + alt görseller — tam koyu S/B tek katman')}
                  onClick={() =>
                    run(t('Alt yığın SVG'), () =>
                      saveTextFile(
                        `${base}-alt-yigin.svg`,
                        svgSideStack(project, getFootprint, 'bottom'),
                        'image/svg+xml'
                      ).then(() => {})
                    )
                  }
                >
                  ▼ {t('Alt yığın — bakır+alan+delik+sınır (S/B)')} (SVG)
                </button>
              )}
              <button
                disabled={busy}
                title={t('Yalnız SMD pad\'ler — lazer/vinil stencil kesimi için')}
                onClick={() =>
                  run(t('Lehim pastası (stencil) SVG'), () =>
                    saveTextFile(
                      `${base}-ust-pasta.svg`,
                      svgSolderPaste(project, getFootprint, 'top', { mirror: svgMirror }),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                🩹 {t('Üst lehim pastası — stencil')} (SVG)
              </button>
              <button
                disabled={busy}
                title={t('Pad açıklıkları (~0.05 mm genişleme) — lehim maskesi')}
                onClick={() =>
                  run(t('Lehim maskesi SVG'), () =>
                    saveTextFile(
                      `${base}-ust-maske.svg`,
                      svgSolderMask(project, getFootprint, 'top', { mirror: svgMirror }),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                ⬚ {t('Üst lehim maskesi')} (SVG)
              </button>
              <button
                disabled={busy}
                title={t('Kart dış hattı + pad konumları + silkscreen (refDes ve pin adları) — elle/makineyle dizgi rehberi')}
                onClick={() =>
                  run(t('Montaj çizimi SVG'), () =>
                    saveTextFile(
                      `${base}-ust-montaj.svg`,
                      svgAssembly(project, getFootprint, 'top'),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                🧩 {t('Üst montaj çizimi')} (SVG)
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  title={t('Kart dış hattı + pad konumları + silkscreen (refDes ve pin adları) — elle/makineyle dizgi rehberi')}
                  onClick={() =>
                    run(t('Alt montaj çizimi SVG'), () =>
                      saveTextFile(
                        `${base}-alt-montaj.svg`,
                        svgAssembly(project, getFootprint, 'bottom'),
                        'image/svg+xml'
                      ).then(() => {})
                    )
                  }
                >
                  🧩 {t('Alt montaj çizimi')} (SVG)
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Şema görüntüsü SVG'), () =>
                    saveTextFile(
                      `${base}-sema.svg`,
                      schematicSvgContent(project, getFootprint),
                      'image/svg+xml'
                    ).then(() => {})
                  )
                }
              >
                ⌁ {t('Şema görüntüsü')} (SVG)
              </button>
            </div>
          </div>
        )}

        {section === 'gcode' && (
          <div className="export-body">
            <p>
              {t('CNC ile PCB üretimi: izolasyon frezeleme (bakır çevresi kazıma), delik delme ve kart kesimi. Alt katman otomatik aynalanır.')}
            </p>
            <div className="gcode-options">
              <GNum label={t('Takım çapı (mm)')} value={gc.toolDiameter} set={(v) => setGc({ ...gc, toolDiameter: v })} step={0.05} />
              <GNum label={t('Kazıma derinliği (mm)')} value={gc.cutDepth} set={(v) => setGc({ ...gc, cutDepth: v })} step={0.01} />
              <GNum label={t('İlerleme (mm/dk)')} value={gc.feedRate} set={(v) => setGc({ ...gc, feedRate: v })} step={10} />
              <GNum label={t('Dalma (mm/dk)')} value={gc.plungeRate} set={(v) => setGc({ ...gc, plungeRate: v })} step={10} />
              <GNum label={t('Güvenli Z (mm)')} value={gc.safeZ} set={(v) => setGc({ ...gc, safeZ: v })} step={0.5} />
              <GNum label={t('İş mili (RPM)')} value={gc.spindleRpm} set={(v) => setGc({ ...gc, spindleRpm: v })} step={1000} />
            </div>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runBatch(() => {
                    const files: ExportFile[] = [
                      {
                        name: `${base}-ust-izolasyon.nc`,
                        content: gcodeIsolation(project, getFootprint, 'top', { ...gc, mirror: false })
                      }
                    ]
                    if (!singleLayer) {
                      files.push({
                        name: `${base}-alt-izolasyon.nc`,
                        content: gcodeIsolation(project, getFootprint, 'bottom', { ...gc, mirror: true })
                      })
                    }
                    files.push(
                      {
                        name: `${base}-delikler.nc`,
                        content: gcodeDrill(project, getFootprint, { ...gc, mirror: false })
                      },
                      {
                        name: `${base}-kesim.nc`,
                        content: gcodeOutlineCut(project, { ...gc, mirror: false })
                      }
                    )
                    return files
                  })
                }
              >
                📦 {t('Tüm G-code Dosyalarını Tek Klasöre Aktar')}
              </button>
            </div>
            <div className="export-buttons">
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Üst katman izolasyon G-code'), () =>
                    saveTextFile(
                      `${base}-ust-izolasyon.nc`,
                      gcodeIsolation(project, getFootprint, 'top', { ...gc, mirror: false })
                    ).then(() => {})
                  )
                }
              >
                ▲ {t('Üst izolasyon')} (.nc)
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(t('Alt katman izolasyon G-code'), () =>
                      saveTextFile(
                        `${base}-alt-izolasyon.nc`,
                        gcodeIsolation(project, getFootprint, 'bottom', { ...gc, mirror: true })
                      ).then(() => {})
                    )
                  }
                >
                  ▼ {t('Alt izolasyon — aynalı')} (.nc)
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Delme G-code'), () =>
                    saveTextFile(
                      `${base}-delikler.nc`,
                      gcodeDrill(project, getFootprint, { ...gc, mirror: false })
                    ).then(() => {})
                  )
                }
              >
                ⊙ {t('Delikler')} (.nc)
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Kart kesim G-code'), () =>
                    saveTextFile(
                      `${base}-kesim.nc`,
                      gcodeOutlineCut(project, { ...gc, mirror: false })
                    ).then(() => {})
                  )
                }
              >
                ✂ {t('Kart kesimi')} (.nc)
              </button>
            </div>
            <p className="calc-note">
              {t('İzolasyon yolları bitmap kontur (0.05 mm çözünürlük) yöntemiyle üretilir; kesişen izler ve bakır alanlar doğru işlenir.')}
            </p>
          </div>
        )}

        {section === 'png' && (
          <div className="export-body">
            <p>{t('Yüksek çözünürlüklü görseller (~600 DPI).')}</p>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runBatch(async () => {
                    const files: ExportFile[] = []
                    const composite = await compositePngBlob(project, getFootprint)
                    if (composite) files.push({ name: `${base}-gorsel.png`, content: composite })
                    const outlineTraces = await outlineTracesPngBlob(project, getFootprint)
                    if (outlineTraces) files.push({ name: `${base}-dishat-yollar.png`, content: outlineTraces })
                    const top = await layerPngBlob(project, getFootprint, 'top', { mirror: false })
                    if (top) files.push({ name: `${base}-ust.png`, content: top })
                    const topSilk = await silkLayerPngBlob(project, getFootprint, 'top')
                    if (topSilk) files.push({ name: `${base}-ust-silk.png`, content: topSilk })
                    const topStack = await sideStackPngBlob(project, getFootprint, 'top')
                    if (topStack) files.push({ name: `${base}-ust-yigin.png`, content: topStack })
                    if (!singleLayer) {
                      const bottom = await layerPngBlob(project, getFootprint, 'bottom', { mirror: true })
                      if (bottom) files.push({ name: `${base}-alt-aynali.png`, content: bottom })
                      const bottomSilk = await silkLayerPngBlob(project, getFootprint, 'bottom')
                      if (bottomSilk) files.push({ name: `${base}-alt-silk.png`, content: bottomSilk })
                      const bottomStack = await sideStackPngBlob(project, getFootprint, 'bottom')
                      if (bottomStack) files.push({ name: `${base}-alt-yigin.png`, content: bottomStack })
                    }
                    const sema = await schematicPngBlob(project, getFootprint)
                    if (sema) files.push({ name: `${base}-sema.png`, content: sema })
                    return files
                  })
                }
              >
                📦 {t('Tüm PNG\'leri Tek Klasöre Aktar')}
              </button>
            </div>
            <div className="export-buttons">
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Birleşik PNG'), () => exportCompositePng(project, getFootprint))
                }
              >
                🎨 {t('Renkli birleşik görünüm')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Dış hat + yollar (S/B) PNG'), () => exportOutlineTracesPng(project, getFootprint))
                }
              >
                🖊 {t('Kart dış hattı + yollar (S/B)')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Üst katman PNG'), () =>
                    exportLayerPng(project, getFootprint, 'top', { mirror: false })
                  )
                }
              >
                ▲ {t('Üst bakır (S/B üretim)')}
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(t('Alt katman PNG (aynalı)'), () =>
                      exportLayerPng(project, getFootprint, 'bottom', { mirror: true })
                    )
                  }
                >
                  ▼ {t('Alt bakır — aynalı (S/B üretim)')}
                </button>
              )}
              <button
                disabled={busy}
                title={t('Üst bakır + üst bakır alanları + delikler + kart sınırı + üst silk + üst görseller — tam koyu S/B tek katman')}
                onClick={() =>
                  run(t('Üst yığın PNG'), () => exportSideStackPng(project, getFootprint, 'top'))
                }
              >
                ▲ {t('Üst yığın — bakır+alan+delik+sınır (S/B)')}
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  title={t('Alt bakır + alt bakır alanları + delikler + kart sınırı + alt silk + alt görseller — tam koyu S/B tek katman')}
                  onClick={() =>
                    run(t('Alt yığın PNG'), () => exportSideStackPng(project, getFootprint, 'bottom'))
                  }
                >
                  ▼ {t('Alt yığın — bakır+alan+delik+sınır (S/B)')}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Üst silkscreen PNG'), () => exportSilkLayerPng(project, getFootprint, 'top'))
                }
              >
                {t('Üst silkscreen')} (PNG)
              </button>
              {!singleLayer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(t('Alt silkscreen PNG'), () => exportSilkLayerPng(project, getFootprint, 'bottom'))
                  }
                >
                  {t('Alt silkscreen')} (PNG)
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Şema görüntüsü PNG'), () => exportSchematicPng(project, getFootprint))
                }
              >
                ⌁ {t('Şema görüntüsü (PNG)')}
              </button>
            </div>
          </div>
        )}

        {section === 'docs' && (
          <div className="export-body">
            <p>{t('Malzeme listesi, dizgi dosyası ve proje yedeği.')}</p>
            <div className="export-buttons">
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  runBatch(() => [
                    {
                      name: `${base}-bom.csv`,
                      content: '﻿' + bomCsv(project, getFootprint),
                      mime: 'text/csv'
                    },
                    {
                      name: `${base}-dizgi.csv`,
                      content: '﻿' + pickAndPlaceCsv(project, getFootprint),
                      mime: 'text/csv'
                    },
                    {
                      name: `${sanitize(project.name)}.cayapcb`,
                      content: JSON.stringify(project, null, 2),
                      mime: 'application/json'
                    }
                  ])
                }
              >
                📦 {t('Tümünü Tek Klasöre Aktar (BOM + Dizgi + Proje)')}
              </button>
            </div>
            <div className="export-buttons">
              <button
                disabled={busy}
                onClick={() =>
                  run('BOM', () =>
                    saveTextFile(`${base}-bom.csv`, '﻿' + bomCsv(project, getFootprint), 'text/csv').then(() => {})
                  )
                }
              >
                📋 {t('Malzeme listesi (BOM .csv)')}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(t('Dizgi dosyası'), () =>
                    saveTextFile(
                      `${base}-dizgi.csv`,
                      '﻿' + pickAndPlaceCsv(project, getFootprint),
                      'text/csv'
                    ).then(() => {})
                  )
                }
              >
                🤖 {t('Dizgi / Pick&Place (.csv)')}
              </button>
              <button
                disabled={busy}
                onClick={() => run(t('Proje'), () => saveProjectFile(project).then(() => {}))}
              >
                💾 {t('Proje dosyası (.cayapcb)')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GNum({
  label,
  value,
  set,
  step
}: {
  label: string
  value: number
  set: (v: number) => void
  step: number
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => set(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}
