// ─── Özellikler paneli ────────────────────────────────────────────────────
// Seçili nesnenin düzenlenebilir özellikleri + seçili iz için otomatik
// elektriksel analiz (uzunluk, direnç, akım kapasitesi).

import { useStore } from '../state/store'
import type { Rotation } from '../types'
import { FONT_STYLES } from '../types'
import {
  currentForTraceWidth,
  formatOhm,
  traceResistance
} from '../core/calculations'
import { polylineLength } from '../core/geometry'
import { useT } from '../i18n'
import { Icon } from './Icon'

export function PropertiesPanel() {
  const selection = useStore((s) => s.selection)
  const project = useStore((s) => s.project)
  const commit = useStore((s) => s.commit)
  const getFootprint = useStore((s) => s.getFootprint)
  const openFootprintEditor = useStore((s) => s.openFootprintEditor)
  const t = useT()

  const comp = project.components.find((c) => selection.componentIds.includes(c.id))
  const trace = project.traces.find((tr) => selection.traceIds.includes(tr.id))
  const via = project.vias.find((v) => selection.viaIds.includes(v.id))
  const text = project.texts.find((tx) => selection.textIds.includes(tx.id))
  const zone = project.zones.find((z) => selection.zoneIds.includes(z.id))
  const image = project.images.find((im) => selection.imageIds.includes(im.id))

  const total =
    selection.componentIds.length + selection.traceIds.length +
    selection.viaIds.length + selection.textIds.length + selection.zoneIds.length +
    selection.imageIds.length

  if (total === 0) {
    return (
      <div className="panel props-panel">
        <h3>{t('Özellikler')}</h3>
        <p className="props-empty">
          {t('Nesne seçilmedi.')}
          <br />
          <br />
          <b>{t('Kısayollar')}</b>
          <br />T: {t('iz çiz')} · V: via · R: {t('döndür')}
          <br />F: {t('yüz değiştir')} · N: {t('net ata')}
          <br />1/2: {t('katman')} · G: {t('ızgara')}
          <br />Ctrl+Z: {t('geri al')} · Home: {t('sığdır')}
          <br />{t('Boşluk+sürükle: kaydır')}
        </p>
      </div>
    )
  }

  return (
    <div className="panel props-panel">
      <h3>
        {t('Özellikler')} {total > 1 && <small>({t('{n} nesne', { n: total })})</small>}
      </h3>

      {comp && (
        <div className="props-group">
          <h4>{t('Komponent')} — {getFootprint(comp.footprintId)?.name}</h4>
          <Field
            label={t('Referans')}
            value={comp.refDes}
            onCommit={(v) =>
              commit((p) => {
                const c = p.components.find((x) => x.id === comp.id)
                if (c) c.refDes = v
              })
            }
          />
          <Field
            label={t('Değer')}
            value={comp.value}
            onCommit={(v) =>
              commit((p) => {
                const c = p.components.find((x) => x.id === comp.id)
                if (c) c.value = v
              })
            }
          />
          <NumField
            label="X (mm)"
            value={comp.x}
            onCommit={(v) =>
              commit((p) => {
                const c = p.components.find((x) => x.id === comp.id)
                if (c) c.x = v
              })
            }
          />
          <NumField
            label="Y (mm)"
            value={comp.y}
            onCommit={(v) =>
              commit((p) => {
                const c = p.components.find((x) => x.id === comp.id)
                if (c) c.y = v
              })
            }
          />
          <div className="field">
            <label>{t('Rotasyon')}</label>
            <select
              value={comp.rotation}
              onChange={(e) =>
                commit((p) => {
                  const c = p.components.find((x) => x.id === comp.id)
                  if (c) c.rotation = parseInt(e.target.value, 10) as Rotation
                })
              }
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
          {project.board.layerCount === 2 && (
            <div className="field">
              <label>{t('Yüz')}</label>
              <select
                value={comp.side}
                onChange={(e) =>
                  commit((p) => {
                    const c = p.components.find((x) => x.id === comp.id)
                    if (c) c.side = e.target.value as 'top' | 'bottom'
                  })
                }
              >
                <option value="top">{t('Üst')}</option>
                <option value="bottom">{t('Alt')}</option>
              </select>
            </div>
          )}

          <div className="props-actions">
            <button
              className="props-action-btn"
              onClick={() => useStore.setState({ pinEditorComponentId: comp.id })}
            >
              <Icon name="net" size={14} /> {t('Pinleri / Netleri Düzenle')}
            </button>
            <button
              className="props-action-btn"
              onClick={() => openFootprintEditor(comp.footprintId)}
            >
              <Icon name="chip" size={14} /> {t('Footprint\'i Düzenle')}
            </button>
          </div>

          {Object.keys(comp.padNets).length > 0 && (
            <div className="pad-nets">
              <label>{t('Net atamaları')}</label>
              {Object.entries(comp.padNets).map(([pad, net]) => (
                <div key={pad} className="pad-net-row">
                  <span>{pad}</span> → <b>{net}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {trace && <TraceProps traceId={trace.id} />}

      {via && (
        <div className="props-group">
          <h4>Via {via.net && <small>({via.net})</small>}</h4>
          <NumField
            label={t('Dış çap (mm)')}
            value={via.diameter}
            onCommit={(v) =>
              commit((p) => {
                const x = p.vias.find((q) => q.id === via.id)
                if (x) x.diameter = v
              })
            }
          />
          <NumField
            label={t('Delik (mm)')}
            value={via.drill}
            onCommit={(v) =>
              commit((p) => {
                const x = p.vias.find((q) => q.id === via.id)
                if (x) x.drill = v
              })
            }
          />
        </div>
      )}

      {text && (
        <div className="props-group">
          <h4>{t('Yazı')}</h4>
          <Field
            label={t('Metin')}
            value={text.text}
            onCommit={(v) =>
              commit((p) => {
                const x = p.texts.find((q) => q.id === text.id)
                if (x) x.text = v
              })
            }
          />
          <NumField
            label={t('Boyut (mm)')}
            value={text.size}
            onCommit={(v) =>
              commit((p) => {
                const x = p.texts.find((q) => q.id === text.id)
                if (x) x.size = Math.max(0.4, v)
              })
            }
          />
          <div className="field">
            <label>{t('Yazı tipi')}</label>
            <select
              value={text.font ?? 'standard'}
              onChange={(e) =>
                commit((p) => {
                  const x = p.texts.find((q) => q.id === text.id)
                  if (x) x.font = e.target.value as NonNullable<typeof text.font>
                })
              }
            >
              {FONT_STYLES.map((f) => (
                <option key={f.id} value={f.id}>{t(f.label)}</option>
              ))}
            </select>
          </div>
          <div className="field field-checkbox">
            <label>{t('Kalın')}</label>
            <input
              type="checkbox"
              checked={!!text.bold}
              onChange={(e) =>
                commit((p) => {
                  const x = p.texts.find((q) => q.id === text.id)
                  if (x) x.bold = e.target.checked
                })
              }
            />
          </div>
          <div className="field">
            <label>{t('Katman')}</label>
            <select
              value={text.layer}
              onChange={(e) =>
                commit((p) => {
                  const x = p.texts.find((q) => q.id === text.id)
                  if (x) x.layer = e.target.value as 'top-silk' | 'bottom-silk'
                })
              }
            >
              <option value="top-silk">{t('Üst silkscreen')}</option>
              <option value="bottom-silk">{t('Alt silkscreen')}</option>
            </select>
          </div>
        </div>
      )}

      {zone && (
        <div className="props-group">
          <h4>
            {t('Bakır Alan')} {zone.net && <small>({zone.net})</small>}
          </h4>
          <Field
            label="Net"
            value={zone.net}
            onCommit={(v) =>
              commit((p) => {
                const x = p.zones.find((q) => q.id === zone.id)
                if (x) x.net = v
              })
            }
          />
          <NumField
            label={t('Boşluk (mm)')}
            value={zone.clearance}
            onCommit={(v) =>
              commit((p) => {
                const x = p.zones.find((q) => q.id === zone.id)
                if (x) x.clearance = Math.min(20, Math.max(0, v))
              })
            }
          />
          <div className="field">
            <label>{t('Pad bağlantı biçimi')}</label>
            <select
              value={zone.connectStyle === 'solid' || zone.thermalRelief === false ? 'solid' : 'thermal'}
              onChange={(e) =>
                commit((p) => {
                  const x = p.zones.find((q) => q.id === zone.id)
                  if (x) {
                    x.connectStyle = e.target.value as 'thermal' | 'solid'
                    // Eski bayrağı da tutarlı tut
                    x.thermalRelief = e.target.value === 'thermal'
                  }
                })
              }
            >
              <option value="thermal">{t('Isı köprüsü (thermal)')}</option>
              <option value="solid">{t('Katı dolgu (solid)')}</option>
            </select>
          </div>
          {!(zone.connectStyle === 'solid' || zone.thermalRelief === false) && (
            <>
              <NumField
                label={t('Köprü genişliği (mm)')}
                value={zone.spokeWidth ?? 0.5}
                onCommit={(v) =>
                  commit((p) => {
                    const x = p.zones.find((q) => q.id === zone.id)
                    if (x) x.spokeWidth = Math.max(0.1, v)
                  })
                }
              />
              <NumField
                label={t('Yalıtım boşluğu (mm)')}
                value={zone.thermalGap ?? 0.5}
                onCommit={(v) =>
                  commit((p) => {
                    const x = p.zones.find((q) => q.id === zone.id)
                    if (x) x.thermalGap = Math.max(0.1, v)
                  })
                }
              />
              <div className="field">
                <label>{t('Köprü sayısı')}</label>
                <select
                  value={zone.spokeCount ?? 4}
                  onChange={(e) =>
                    commit((p) => {
                      const x = p.zones.find((q) => q.id === zone.id)
                      if (x) x.spokeCount = (parseInt(e.target.value) === 2 ? 2 : 4)
                    })
                  }
                >
                  <option value={4}>4</option>
                  <option value={2}>2</option>
                </select>
              </div>
              <div className="field field-checkbox">
                <label>{t('Genişlik sınırını kaldır (gelişmiş)')}</label>
                <input
                  type="checkbox"
                  checked={!!zone.spokeUnclamped}
                  onChange={(e) =>
                    commit((p) => {
                      const x = p.zones.find((q) => q.id === zone.id)
                      if (x) x.spokeUnclamped = e.target.checked
                    })
                  }
                />
              </div>
              {zone.spokeUnclamped && (
                <p className="calc-note">
                  {t('Köprü genişliği pad boyutuna göre otomatik küçültülmez — girdiğiniz değer aynen kullanılır. Çok geniş köprüler pad dışına taşabilir.')}
                </p>
              )}
            </>
          )}
          <div className="props-info">
            {(() => {
              const xs = zone.points.map((p) => p.x)
              const ys = zone.points.map((p) => p.y)
              const w = Math.max(...xs) - Math.min(...xs)
              const h = Math.max(...ys) - Math.min(...ys)
              return `${w.toFixed(1)} × ${h.toFixed(1)} mm`
            })()}{' '}
            — {zone.layer === 'top' ? t('üst') : t('alt')} {t('katman')}
          </div>
        </div>
      )}

      {image && <ImageProps imageId={image.id} />}
    </div>
  )
}

/** Seçili görsel (logo/işaret) özellikleri */
function ImageProps({ imageId }: { imageId: string }) {
  const project = useStore((s) => s.project)
  const commit = useStore((s) => s.commit)
  const t = useT()
  const im = project.images.find((x) => x.id === imageId)
  if (!im) return null
  const aspect = im.width / im.height

  return (
    <div className="props-group">
      <h4>
        <Icon name="image" size={13} /> {t('Görsel')} <small>({im.format.toUpperCase()})</small>
      </h4>
      <NumField
        label={t('Genişlik (mm)')}
        value={im.width}
        onCommit={(v) =>
          commit((p) => {
            const x = p.images.find((q) => q.id === imageId)
            if (x) {
              const w = Math.max(0.5, v)
              if (x.locked) x.height = +(w / aspect).toFixed(3) // kilitliyken oranı koru
              x.width = w
            }
          })
        }
      />
      <NumField
        label={t('Yükseklik (mm)')}
        value={im.height}
        onCommit={(v) =>
          commit((p) => {
            const x = p.images.find((q) => q.id === imageId)
            if (x) {
              const h = Math.max(0.5, v)
              if (x.locked) x.width = +(h * aspect).toFixed(3)
              x.height = h
            }
          })
        }
      />
      <NumField
        label="X (mm)"
        value={im.x}
        onCommit={(v) => commit((p) => { const x = p.images.find((q) => q.id === imageId); if (x) x.x = v })}
      />
      <NumField
        label="Y (mm)"
        value={im.y}
        onCommit={(v) => commit((p) => { const x = p.images.find((q) => q.id === imageId); if (x) x.y = v })}
      />
      <div className="field">
        <label>{t('Rotasyon')}</label>
        <select
          value={im.rotation}
          onChange={(e) =>
            commit((p) => {
              const x = p.images.find((q) => q.id === imageId)
              if (x) x.rotation = parseInt(e.target.value, 10) as typeof x.rotation
            })
          }
        >
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>
      <div className="field">
        <label>{t('Opaklık')}: {Math.round((im.opacity ?? 1) * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={im.opacity ?? 1}
          onChange={(e) =>
            commit((p) => {
              const x = p.images.find((q) => q.id === imageId)
              if (x) x.opacity = parseFloat(e.target.value)
            })
          }
        />
      </div>
      <div className="field">
        <label>{t('Katman')}</label>
        <select
          value={im.layer}
          onChange={(e) =>
            commit((p) => {
              const x = p.images.find((q) => q.id === imageId)
              if (x) x.layer = e.target.value as 'top-silk' | 'bottom-silk'
            })
          }
        >
          <option value="top-silk">{t('Üst silkscreen')}</option>
          <option value="bottom-silk">{t('Alt silkscreen')}</option>
        </select>
      </div>
      <div className="field field-checkbox">
        <label>{t('Aynala (yatay)')}</label>
        <input
          type="checkbox"
          checked={!!im.mirror}
          onChange={(e) =>
            commit((p) => { const x = p.images.find((q) => q.id === imageId); if (x) x.mirror = e.target.checked })
          }
        />
      </div>
      <div className="field field-checkbox">
        <label>{t('En-boy oranını kilitle')}</label>
        <input
          type="checkbox"
          checked={!!im.locked}
          onChange={(e) =>
            commit((p) => { const x = p.images.find((q) => q.id === imageId); if (x) x.locked = e.target.checked })
          }
        />
      </div>
      <div className="props-info">{im.width.toFixed(1)} × {im.height.toFixed(1)} mm</div>
    </div>
  )
}

/** Seçili iz: özellikler + otomatik elektriksel analiz */
function TraceProps({ traceId }: { traceId: string }) {
  const project = useStore((s) => s.project)
  const commit = useStore((s) => s.commit)
  const t = useT()
  const trace = project.traces.find((tr) => tr.id === traceId)
  if (!trace) return null

  const length = polylineLength(trace.points)
  const oz = project.rules.copperWeightOz
  const resistance = traceResistance(length, trace.width, oz)
  const maxCurrent10 = currentForTraceWidth(trace.width, 10, oz, true)
  const maxCurrent20 = currentForTraceWidth(trace.width, 20, oz, true)

  return (
    <div className="props-group">
      <h4>
        {t('İz')} {trace.net && <small>({trace.net})</small>}
      </h4>
      <NumField
        label={t('Genişlik (mm)')}
        value={trace.width}
        onCommit={(v) =>
          commit((p) => {
            const x = p.traces.find((q) => q.id === traceId)
            if (x) x.width = v
          })
        }
      />
      <div className="field">
        <label>{t('Katman')}</label>
        <select
          value={trace.layer}
          onChange={(e) =>
            commit((p) => {
              const x = p.traces.find((q) => q.id === traceId)
              if (x) x.layer = e.target.value as 'top' | 'bottom'
            })
          }
        >
          <option value="top">{t('Üst')}</option>
          {project.board.layerCount === 2 && <option value="bottom">{t('Alt')}</option>}
        </select>
      </div>
      <div className="props-info">
        {t('İpucu: köşe noktalarını canvas üzerinde sürükleyerek düzenleyebilirsiniz')}
      </div>
      <div className="trace-analysis">
        <h5><Icon name="net" size={13} /> {t('Otomatik analiz')} ({oz} oz)</h5>
        <div>{t('Uzunluk')}: <b>{length.toFixed(2)} mm</b></div>
        <div>{t('Direnç')}: <b>{formatOhm(resistance)}</b></div>
        <div>{t('Maks. akım')} (ΔT=10°C): <b>{maxCurrent10.toFixed(2)} A</b></div>
        <div>{t('Maks. akım')} (ΔT=20°C): <b>{maxCurrent20.toFixed(2)} A</b></div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onCommit
}: {
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        key={value}
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </div>
  )
}

function NumField({
  label,
  value,
  onCommit
}: {
  label: string
  value: number
  onCommit: (v: number) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        key={value}
        type="number"
        step="0.05"
        defaultValue={Number(value.toFixed(3))}
        onBlur={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && Math.abs(v - value) > 1e-9) onCommit(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </div>
  )
}
