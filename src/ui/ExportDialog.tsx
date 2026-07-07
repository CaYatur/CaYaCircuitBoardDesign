// ─── Dışa aktarma dialogu ─────────────────────────────────────────────────
// Gerber, Excellon, SVG (lazer), G-code (CNC), PNG, BOM, dizgi — katman
// katman veya toplu.

import { useState } from 'react'
import { useStore } from '../state/store'
import type { CopperLayer } from '../types'
import { saveTextFile, saveFilesToDirectory, type ExportFile } from '../io/files'
import { gerberFileSet, sanitize } from '../io/gerber'
import { excellonDrill } from '../io/excellon'
import { svgCopperLayer, svgSilkLayer, svgOutline, svgComposite, svgOutlineTraces } from '../io/svg'
import {
  defaultGcodeOptions,
  gcodeDrill,
  gcodeIsolation,
  gcodeOutlineCut
} from '../io/gcode'
import { bomCsv, pickAndPlaceCsv } from '../io/bom'
import { exportCompositePng, exportLayerPng, compositePngBlob, layerPngBlob, exportOutlineTracesPng } from '../io/png'
import {
  exportSchematicPng,
  schematicSvgContent,
  schematicPngBlob
} from '../io/schematicImage'
import { saveProjectFile } from '../io/project'
import { useT } from '../i18n'

type Section = 'gerber' | 'svg' | 'gcode' | 'png' | 'docs'

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
      const n = await saveFilesToDirectory(files)
      setStatus(
        n > 0
          ? t('✓ {n} dosya tek seferde dışa aktarıldı', { n })
          : t('Toplu dışa aktarma iptal edildi')
      )
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
        </div>

        {section === 'gerber' && (
          <div className="export-body">
            <p>
              {t('PCB üreticilerine (JLCPCB, PCBWay vb.) gönderilecek standart üretim dosyaları: üst/alt bakır, üst/alt silkscreen, kart sınırı ve Excellon delik dosyası.')}
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
                    return files
                  })
                }
              >
                📦 {t('Tüm Gerber Setini Tek Klasöre Aktar (6 dosya)')}
              </button>
            </div>
            <h4>{t('Tek katman')}:</h4>
            <div className="export-buttons">
              {(
                [
                  [t('Üst bakır') + ' (.gtl)', 0],
                  [t('Alt bakır') + ' (.gbl)', 1],
                  [t('Üst silk') + ' (.gto)', 2],
                  [t('Alt silk') + ' (.gbo)', 3],
                  [t('Kart sınırı') + ' (.gm1)', 4]
                ] as [string, number][]
              ).map(([label, idx]) => (
                <button
                  key={label}
                  disabled={busy}
                  onClick={() =>
                    run(label, async () => {
                      const f = gerberFileSet(project, getFootprint)[idx]
                      await saveTextFile(f.name, f.content)
                    })
                  }
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
                    const top = await layerPngBlob(project, getFootprint, 'top', { mirror: false })
                    if (top) files.push({ name: `${base}-ust.png`, content: top })
                    if (!singleLayer) {
                      const bottom = await layerPngBlob(project, getFootprint, 'bottom', { mirror: true })
                      if (bottom) files.push({ name: `${base}-alt-aynali.png`, content: bottom })
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
