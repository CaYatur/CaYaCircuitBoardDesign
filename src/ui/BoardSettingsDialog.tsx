// ─── Kart ayarları ve tasarım kuralları ───────────────────────────────────

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import type { Project } from '../types'
import { DEFAULT_PCB_COLOR, PCB_COLORS } from '../types'
import { useT } from '../i18n'

const formFromProject = (project: Project) => ({
  name: project.name,
  shape: project.board.shape,
  width: project.board.width,
  height: project.board.height,
  cornerRadius: project.board.cornerRadius,
  layerCount: project.board.layerCount,
  color: project.board.color || DEFAULT_PCB_COLOR,
  mountingHoles: project.board.mountingHoles.length > 0,
  holeDrill: project.board.mountingHoles[0]?.drill ?? 3.2,
  ...project.rules,
  defaultTraceWidth: project.settings.defaultTraceWidth,
  defaultViaDiameter: project.settings.defaultViaDiameter,
  defaultViaDrill: project.settings.defaultViaDrill,
  defaultTextSize: project.settings.defaultTextSize
})

export function BoardSettingsDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const project = useStore((s) => s.project)
  const commit = useStore((s) => s.commit)
  const t = useT()

  const setTool = useStore((s) => s.setTool)

  const [form, setForm] = useState(() => formFromProject(project))

  // Diyalog her açıldığında formu güncel proje durumuyla yeniden senkronla
  // (ör. serbest çizim aracıyla kart şekli diyalog dışında değişmiş olabilir)
  useEffect(() => {
    if (activeDialog === 'board-settings') setForm(formFromProject(project))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog])

  if (activeDialog !== 'board-settings') return null

  const set = (k: string, v: number | string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  const apply = () => {
    commit((p) => {
      p.name = String(form.name).trim() || p.name
      if (form.shape === 'polygon') {
        // Boyutlar serbest çizim aracıyla belirlenir; burada değiştirilmez
      } else {
        p.board.shape = form.shape
        p.board.points = undefined
        if (form.shape === 'circle') {
          const d = Math.max(10, Number(form.width))
          p.board.width = d
          p.board.height = d
        } else {
          p.board.width = Math.max(10, Number(form.width))
          p.board.height = Math.max(10, Number(form.height))
        }
      }
      p.board.cornerRadius = Math.max(0, Number(form.cornerRadius))
      p.board.color = String(form.color) || DEFAULT_PCB_COLOR
      p.board.layerCount = form.layerCount === 1 ? 1 : 2
      if (p.board.layerCount === 1) {
        // Tek katmana geçişte alt yüzdeki komponentleri üste taşı
        for (const c of p.components) c.side = 'top'
      }
      if (form.mountingHoles) {
        const m = 4.5
        const d = Number(form.holeDrill)
        p.board.mountingHoles = [
          { x: m, y: m, drill: d },
          { x: p.board.width - m, y: m, drill: d },
          { x: m, y: p.board.height - m, drill: d },
          { x: p.board.width - m, y: p.board.height - m, drill: d }
        ]
      } else {
        p.board.mountingHoles = []
      }
      p.rules.minTraceWidth = Number(form.minTraceWidth)
      p.rules.clearance = Number(form.clearance)
      p.rules.minViaDrill = Number(form.minViaDrill)
      p.rules.minAnnularRing = Number(form.minAnnularRing)
      p.rules.edgeClearance = Number(form.edgeClearance)
      p.rules.copperWeightOz = Number(form.copperWeightOz)
      p.settings.defaultTraceWidth = Number(form.defaultTraceWidth)
      p.settings.defaultViaDiameter = Number(form.defaultViaDiameter)
      p.settings.defaultViaDrill = Number(form.defaultViaDrill)
      p.settings.defaultTextSize = Number(form.defaultTextSize)
    }, t('Kart ayarları güncellendi'))
    if (form.layerCount === 1) {
      useStore.getState().setActiveLayer('top')
    }
    openDialog(null)
  }

  const F = ({
    label,
    k,
    step = 0.05,
    unit = 'mm'
  }: {
    label: string
    k: keyof typeof form
    step?: number
    unit?: string
  }) => (
    <div className="field">
      <label>{label}</label>
      <div className="field-unit">
        <input
          type="number"
          step={step}
          value={form[k] as number}
          onChange={(e) => set(k, parseFloat(e.target.value) || 0)}
        />
        <span>{unit}</span>
      </div>
    </div>
  )

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal board-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙ {t('Kart Ayarları & Tasarım Kuralları')}</h3>
          <button onClick={() => openDialog(null)}>✕</button>
        </div>
        <div className="board-settings-grid">
          <div>
            <h4>{t('Kart')}</h4>
            <div className="field">
              <label>{t('Proje adı')}</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t('Kart şekli')}</label>
              <select
                value={form.shape}
                onChange={(e) => set('shape', e.target.value)}
              >
                <option value="rect">{t('Dikdörtgen / Kare')}</option>
                <option value="circle">{t('Daire')}</option>
                <option value="oval">{t('Oval')}</option>
                <option value="polygon">{t('Serbest çizim')}</option>
              </select>
            </div>
            {form.shape === 'polygon' ? (
              <p className="calc-note">
                {t('Kart dış hattı serbest çizimle belirlenir. Aşağıdaki düğmeyle kartı doğrudan tuval üzerinde çizin.')}
              </p>
            ) : form.shape === 'circle' ? (
              <F label={t('Çap')} k="width" step={1} />
            ) : (
              <>
                <F label={t('Genişlik')} k="width" step={1} />
                <F label={t('Yükseklik')} k="height" step={1} />
              </>
            )}
            {form.shape === 'rect' && (
              <F label={t('Köşe yuvarlatma')} k="cornerRadius" step={0.5} />
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                set('shape', 'polygon')
                setTool('board-shape')
                openDialog(null)
              }}
              title={t('Kartı tuval üzerinde köşe köşe çizin — çift tık/Enter ile bitirin')}
            >
              ✎ {t('Kartı Çiz (serbest)')}
            </button>
            <div className="field">
              <label>{t('PCB rengi (lehim maskesi)')}</label>
              <div className="pcb-color-swatches">
                {PCB_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={
                      'pcb-swatch' +
                      (String(form.color).toLowerCase() === c.value.toLowerCase() ? ' active' : '')
                    }
                    style={{ background: c.value }}
                    title={t(c.name)}
                    onClick={() => set('color', c.value)}
                  />
                ))}
                <input
                  type="color"
                  className="pcb-swatch-custom"
                  value={String(form.color)}
                  onChange={(e) => set('color', e.target.value)}
                  title={t('Özel renk')}
                />
              </div>
            </div>
            <div className="field">
              <label>{t('Katman sayısı')}</label>
              <select
                value={form.layerCount}
                onChange={(e) => set('layerCount', parseInt(e.target.value, 10))}
              >
                <option value={2}>{t('Çift katman (üst + alt)')}</option>
                <option value={1}>{t('Tek katman (yalnız üst)')}</option>
              </select>
            </div>
            {form.layerCount === 1 && (
              <p className="calc-note">
                {t('Tek katmanda via/alt bakır kapalıdır; otorouter yalnız üst katmanı kullanır. Alt yüzdeki komponentler üste taşınır.')}
              </p>
            )}
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={form.mountingHoles}
                  onChange={(e) => set('mountingHoles', e.target.checked)}
                />{' '}
                {t('Köşelerde montaj deliği')}
              </label>
            </div>
            {form.mountingHoles && <F label={t('Delik çapı')} k="holeDrill" step={0.1} />}
          </div>
          <div>
            <h4>{t('Tasarım kuralları (DRC)')}</h4>
            <F label={t('Min. iz genişliği')} k="minTraceWidth" />
            <F label={t('Bakır boşluğu (clearance)')} k="clearance" />
            <F label={t('Min. via deliği')} k="minViaDrill" />
            <F label={t('Min. via halkası')} k="minAnnularRing" />
            <F label={t('Kart kenarı boşluğu')} k="edgeClearance" />
            <F label={t('Bakır ağırlığı')} k="copperWeightOz" step={0.5} unit="oz" />
          </div>
          <div>
            <h4>{t('Varsayılanlar')}</h4>
            <F label={t('İz genişliği')} k="defaultTraceWidth" />
            <F label={t('Via dış çapı')} k="defaultViaDiameter" />
            <F label={t('Via deliği')} k="defaultViaDrill" />
            <F label={t('Yazı boyutu')} k="defaultTextSize" step={0.25} />
            <p className="calc-note">
              {t('İpucu: yüksek akım hatları için gereken genişliği Hesaplayıcılar\'dan (🧮) bulabilirsiniz.')}
            </p>
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn-secondary" onClick={() => openDialog(null)}>
            {t('İptal')}
          </button>
          <button className="btn-primary" onClick={apply}>
            {t('Uygula')}
          </button>
        </div>
      </div>
    </div>
  )
}
