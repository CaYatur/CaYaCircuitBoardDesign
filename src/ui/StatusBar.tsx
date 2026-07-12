// ─── Alt durum çubuğu ─────────────────────────────────────────────────────

import { useStore } from '../state/store'
import { useT } from '../i18n'
import { formatLen, unitSuffix } from '../core/units'
import type { MeasureUnit } from '../types'

export function StatusBar() {
  const message = useStore((s) => s.statusMessage)
  const tool = useStore((s) => s.tool)
  const mode = useStore((s) => s.mode)
  const activeLayer = useStore((s) => s.activeLayer)
  const updateSettings = useStore((s) => s.updateSettings)
  const units = useStore((s) => s.project.settings.units ?? 'mm')
  const boardWidth = useStore((s) => s.project.board.width)
  const boardHeight = useStore((s) => s.project.board.height)
  const layerCount = useStore((s) => s.project.board.layerCount)
  const compCount = useStore((s) => s.project.components.length)
  const traceCount = useStore((s) => s.project.traces.length)
  const viaCount = useStore((s) => s.project.vias.length)
  const t = useT()

  const toolNames: Record<string, string> = {
    select: t('Seç'),
    trace: t('İz'),
    via: 'Via',
    text: t('Yazı'),
    zone: t('Alan'),
    measure: t('Ölçüm'),
    net: t('Net'),
    delete: t('Sil'),
    'board-shape': t('Kart Çizimi')
  }

  return (
    <div className="status-bar">
      <span className="status-msg">{message}</span>
      <span className="status-right">
        {mode === 'pcb' && (
          <>
            <span className="status-chip">{toolNames[tool] ?? tool}</span>
            <span className={`status-chip layer-${activeLayer}`}>
              {activeLayer === 'top' ? '▲ ' + t('Üst') : '▼ ' + t('Alt')}
            </span>
          </>
        )}
        <label className="status-chip status-unit" title={t('Ölçü birimi (mm / mil / inç)')}>
          {t('Birim')}:
          <select
            value={units}
            onChange={(e) => updateSettings((p) => { p.settings.units = e.target.value as MeasureUnit })}
          >
            <option value="mm">mm</option>
            <option value="mil">mil</option>
            <option value="inch">inch</option>
          </select>
        </label>
        <span className="status-chip">
          {formatLen(boardWidth, units)}×{formatLen(boardHeight, units)} {unitSuffix(units)} ·{' '}
          {layerCount === 1 ? t('1 katman') : t('2 katman')}
        </span>
        <span className="status-chip">
          {t('{c} komp · {t} iz · {v} via', {
            c: compCount,
            t: traceCount,
            v: viaCount
          })}
        </span>
        <a
          className="status-chip brand-link"
          href="https://cayadev.com"
          target="_blank"
          rel="noreferrer"
          title="CaYaDev"
        >
          CaYaDev · cayadev.com
        </a>
      </span>
    </div>
  )
}
