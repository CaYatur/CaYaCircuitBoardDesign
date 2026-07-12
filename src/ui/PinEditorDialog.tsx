// ─── Pin / Net Editörü ────────────────────────────────────────────────────
// Seçili komponentin tüm pinlerini tek tabloda gösterir: net atama, hızlı
// atama butonları (GND/VCC/5V/3V3...), toplu temizleme. Hazır kartların
// (Arduino, ESP...) pinlerine buradan kolayca net verilir.

import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useT } from '../i18n'
import { Icon } from './Icon'

const QUICK_NETS = ['GND', 'VCC', '5V', '3V3', '12V', 'VIN']

export function PinEditorDialog() {
  const compId = useStore((s) => s.pinEditorComponentId)
  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const commit = useStore((s) => s.commit)
  const openFootprintEditor = useStore((s) => s.openFootprintEditor)
  const t = useT()

  const comp = project.components.find((c) => c.id === compId)
  const fp = comp ? getFootprint(comp.footprintId) : undefined

  // Yerel taslak: Uygula'ya basınca tek commit
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [activePad, setActivePad] = useState<string | null>(null)

  useEffect(() => {
    if (comp) setDraft({ ...comp.padNets })
  }, [compId])

  if (!comp || !fp) return null

  const close = () => useStore.setState({ pinEditorComponentId: null })

  const apply = () => {
    commit((p) => {
      const c = p.components.find((x) => x.id === comp.id)
      if (!c) return
      c.padNets = {}
      for (const [pad, net] of Object.entries(draft)) {
        if (net.trim()) c.padNets[pad] = net.trim()
      }
    }, t('{ref} pin netleri güncellendi', { ref: comp.refDes }))
    close()
  }

  const pads = fp.pads.filter((p) => !p.name.startsWith('MH'))

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal pin-editor-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Icon name="net" size={15} /> {t('Pin / Net Editörü')} — {comp.refDes}{' '}
            <small>({fp.name})</small>
          </h3>
          <button onClick={close}><Icon name="close" size={14} /></button>
        </div>

        <div className="pin-editor-tools">
          <span className="tsb-hint">
            {t('Bir satıra tıklayıp hızlı net butonlarını kullanın veya elle yazın. Boş bırakılan pin atanmamış olur.')}
          </span>
          <div className="quick-nets">
            {QUICK_NETS.map((n) => (
              <button
                key={n}
                disabled={!activePad}
                onClick={() => {
                  if (activePad) setDraft((d) => ({ ...d, [activePad]: n }))
                }}
              >
                {n}
              </button>
            ))}
            <button
              disabled={!activePad}
              onClick={() => {
                if (activePad) setDraft((d) => ({ ...d, [activePad]: '' }))
              }}
            >
              {t('Temizle')}
            </button>
          </div>
        </div>

        <div className="pin-table">
          <div className="pin-table-header">
            <span>{t('Pin')}</span>
            <span>{t('Net')}</span>
            <span>{t('Hızlı')}</span>
          </div>
          <div className="pin-table-body">
            {pads.map((pad) => (
              <div
                key={pad.name}
                className={`pin-table-row ${activePad === pad.name ? 'active' : ''}`}
                onClick={() => setActivePad(pad.name)}
              >
                <span className="pin-name">{pad.name}</span>
                <input
                  value={draft[pad.name] ?? ''}
                  placeholder={t('atanmamış')}
                  onFocus={() => setActivePad(pad.name)}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [pad.name]: e.target.value }))
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <span className="pin-quick">
                  <button
                    tabIndex={-1}
                    onClick={() => setDraft((d) => ({ ...d, [pad.name]: 'GND' }))}
                  >
                    GND
                  </button>
                  <button
                    tabIndex={-1}
                    onClick={() => setDraft((d) => ({ ...d, [pad.name]: 'VCC' }))}
                  >
                    VCC
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-buttons">
          <button
            className="btn-secondary"
            onClick={() => {
              close()
              openFootprintEditor(comp.footprintId)
            }}
            title={t('Footprint ölçülerini/pad adlarını düzenle (kopya oluşturulur)')}
          >
            ⬡ {t('Footprint\'i Düzenle')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={close}>
            {t('İptal')}
          </button>
          <button className="btn-primary" onClick={apply}>
            <Icon name="check" size={13} /> {t('Uygula')}
          </button>
        </div>
      </div>
    </div>
  )
}
