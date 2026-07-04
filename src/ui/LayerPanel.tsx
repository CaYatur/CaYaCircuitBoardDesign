// ─── Katman görünürlük paneli ─────────────────────────────────────────────

import { useStore } from '../state/store'
import type { VisibleLayer } from '../types'
import { COLORS } from '../render/renderer'
import { useT } from '../i18n'

const layers: { id: VisibleLayer; label: string; color: string; copper?: boolean }[] = [
  { id: 'top', label: 'Üst bakır', color: COLORS.top, copper: true },
  { id: 'bottom', label: 'Alt bakır', color: COLORS.bottom, copper: true },
  { id: 'top-silk', label: 'Üst silkscreen', color: COLORS.topSilk },
  { id: 'bottom-silk', label: 'Alt silkscreen', color: COLORS.bottomSilk },
  { id: 'zones', label: 'Bakır alanlar', color: '#7a9e7e' },
  { id: 'drill', label: 'Delikler', color: '#666' },
  { id: 'outline', label: 'Kart sınırı', color: COLORS.boardEdge },
  { id: 'ratsnest', label: 'Ratsnest (hava telleri)', color: COLORS.ratsnest }
]

export function LayerPanel() {
  const visible = useStore((s) => s.visibleLayers)
  const toggle = useStore((s) => s.toggleLayer)
  const activeLayer = useStore((s) => s.activeLayer)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const layerCount = useStore((s) => s.project.board.layerCount)
  const t = useT()

  return (
    <div className="panel layer-panel">
      <h3>
        {t('Katmanlar')}{' '}
        <small>{layerCount === 1 ? t('(tek katman)') : t('(çift katman)')}</small>
      </h3>
      {layers.map((l) => {
        const disabled =
          layerCount === 1 && (l.id === 'bottom' || l.id === 'bottom-silk')
        return (
          <div key={l.id} className={`layer-row ${disabled ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              id={`layer-${l.id}`}
              checked={visible[l.id] && !disabled}
              disabled={disabled}
              onChange={() => toggle(l.id)}
            />
            <span className="layer-swatch" style={{ background: l.color }} />
            <label htmlFor={`layer-${l.id}`}>{t(l.label)}</label>
            {l.copper && !disabled && (
              <button
                className={`layer-active-btn ${activeLayer === l.id ? 'on' : ''}`}
                title={t('Aktif çizim katmanı yap')}
                onClick={() => setActiveLayer(l.id as 'top' | 'bottom')}
              >
                {activeLayer === l.id ? '● ' + t('aktif') : '○'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
