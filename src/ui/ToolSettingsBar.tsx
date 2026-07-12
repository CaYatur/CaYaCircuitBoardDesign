// ─── Bağlamsal araç ayar çubuğu ───────────────────────────────────────────
// Seçili araca göre değişen hızlı ayarlar: iz genişliği ön ayarları, via
// çapları, yazı boyutu/kalınlığı, ölçüm-taşıma vb. Ayar değişiklikleri undo
// geçmişini kirletmez (mutateLive).

import { useStore } from '../state/store'
import { FONT_STYLES } from '../types'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { formatLen, unitSuffix } from '../core/units'

const TRACE_PRESETS = [0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.5, 2.0]

export function ToolSettingsBar() {
  const tool = useStore((s) => s.tool)
  const project = useStore((s) => s.project)
  const units = project.settings.units ?? 'mm'
  const mutateLive = useStore((s) => s.mutateLive)
  const activeLayer = useStore((s) => s.activeLayer)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const drawingTrace = useStore((s) => s.drawingTrace)
  const selection = useStore((s) => s.selection)
  const lastMeasure = useStore((s) => s.lastMeasure)
  const moveSelectionBy = useStore((s) => s.moveSelectionBy)
  const rotateSelection = useStore((s) => s.rotateSelection)
  const flipSelection = useStore((s) => s.flipSelection)
  const deleteSelection = useStore((s) => s.deleteSelection)
  const commit = useStore((s) => s.commit)
  const t = useT()

  const settings = project.settings
  const singleLayer = project.board.layerCount === 1

  const setTraceWidth = (w: number) => {
    if (w <= 0) return
    mutateLive((p) => {
      p.settings.defaultTraceWidth = w
    })
    // Çizim sürüyorsa aktif izi de güncelle
    if (drawingTrace) {
      useStore.setState({ drawingTrace: { ...drawingTrace, width: w } })
    }
  }

  const selCount =
    selection.componentIds.length + selection.traceIds.length +
    selection.viaIds.length + selection.textIds.length + selection.zoneIds.length +
    selection.imageIds.length

  const selectedTraces = project.traces.filter((tr) =>
    selection.traceIds.includes(tr.id)
  )

  return (
    <div className="tool-settings-bar">
      {tool === 'trace' && (
        <>
          <span className="tsb-label">{t('İz genişliği')}:</span>
          <input
            className="tsb-num"
            type="number"
            step={0.05}
            min={0.1}
            value={settings.defaultTraceWidth}
            onChange={(e) => setTraceWidth(parseFloat(e.target.value) || 0.4)}
          />
          <span className="tsb-unit">mm</span>
          <span className="tsb-presets">
            {TRACE_PRESETS.map((w) => (
              <button
                key={w}
                className={Math.abs(settings.defaultTraceWidth - w) < 0.001 ? 'active' : ''}
                onClick={() => setTraceWidth(w)}
              >
                {w}
              </button>
            ))}
          </span>
          <span className="tsb-sep" />
          <span className="tsb-label">{t('Katman')}:</span>
          <select
            value={activeLayer}
            onChange={(e) => setActiveLayer(e.target.value as 'top' | 'bottom')}
          >
            <option value="top">{t('Üst')}</option>
            {!singleLayer && <option value="bottom">{t('Alt')}</option>}
          </select>
          {drawingTrace && (
            <span className="tsb-hint">
              {t('Çizim sürüyor — V: via ile katman değiştir, Enter: bitir')}
            </span>
          )}
        </>
      )}

      {tool === 'via' && (
        <>
          <span className="tsb-label">{t('Via dış çapı')}:</span>
          <input
            className="tsb-num"
            type="number"
            step={0.05}
            min={0.3}
            value={settings.defaultViaDiameter}
            onChange={(e) =>
              mutateLive((p) => {
                p.settings.defaultViaDiameter = parseFloat(e.target.value) || 0.8
              })
            }
          />
          <span className="tsb-unit">mm</span>
          <span className="tsb-label">{t('Delik')}:</span>
          <input
            className="tsb-num"
            type="number"
            step={0.05}
            min={0.15}
            value={settings.defaultViaDrill}
            onChange={(e) =>
              mutateLive((p) => {
                p.settings.defaultViaDrill = parseFloat(e.target.value) || 0.4
              })
            }
          />
          <span className="tsb-unit">mm</span>
          {singleLayer && (
            <span className="tsb-hint warn">{t('Tek katmanlı kart — via katman değiştirmez')}</span>
          )}
        </>
      )}

      {tool === 'text' && (
        <>
          <span className="tsb-label">{t('Yazı boyutu')}:</span>
          <input
            className="tsb-num"
            type="number"
            step={0.25}
            min={0.5}
            value={settings.defaultTextSize}
            onChange={(e) =>
              mutateLive((p) => {
                p.settings.defaultTextSize = parseFloat(e.target.value) || 1.5
              })
            }
          />
          <span className="tsb-unit">mm</span>
          <span className="tsb-presets">
            {[1, 1.5, 2, 3, 4].map((v) => (
              <button
                key={v}
                className={Math.abs(settings.defaultTextSize - v) < 0.001 ? 'active' : ''}
                onClick={() =>
                  mutateLive((p) => {
                    p.settings.defaultTextSize = v
                  })
                }
              >
                {v}
              </button>
            ))}
          </span>
          <span className="tsb-sep" />
          <span className="tsb-label">{t('Yazı tipi')}:</span>
          <select
            value={settings.defaultTextFont ?? 'standard'}
            onChange={(e) =>
              mutateLive((p) => {
                p.settings.defaultTextFont = e.target.value as typeof settings.defaultTextFont
              })
            }
          >
            {FONT_STYLES.map((f) => (
              <option key={f.id} value={f.id}>{t(f.label)}</option>
            ))}
          </select>
          <span className="tsb-hint">
            {t('Yazılar üretim uyumlu çizgi (stroke) fontla çizilir — seçip Özellikler\'den yazı tipi/boyut/kalınlık değiştirilebilir')}
          </span>
        </>
      )}

      {tool === 'zone' && (
        <>
          <span className="tsb-label">{t('Bakır alan boşluğu')}:</span>
          <input
            className="tsb-num"
            type="number"
            step={0.05}
            min={0.1}
            value={project.rules.clearance}
            onChange={(e) =>
              mutateLive((p) => {
                p.rules.clearance = parseFloat(e.target.value) || 0.25
              })
            }
          />
          <span className="tsb-unit">mm</span>
          <span className="tsb-hint">{t('Alan, farklı netlerin çevresinde otomatik boşluk bırakır')}</span>
        </>
      )}

      {tool === 'measure' && (
        <>
          {lastMeasure ? (
            <>
              <span className="tsb-label">
                Δx = {formatLen(lastMeasure.b.x - lastMeasure.a.x, units)} {unitSuffix(units)}, Δy ={' '}
                {formatLen(lastMeasure.b.y - lastMeasure.a.y, units)} {unitSuffix(units)} (
                {formatLen(Math.hypot(
                  lastMeasure.b.x - lastMeasure.a.x,
                  lastMeasure.b.y - lastMeasure.a.y
                ), units)}{' '}
                {unitSuffix(units)})
              </span>
              <button
                className="tsb-action"
                disabled={selCount === 0}
                title={selCount === 0 ? t('Önce Seç aracıyla nesne seçin') : ''}
                onClick={() =>
                  moveSelectionBy(
                    lastMeasure.b.x - lastMeasure.a.x,
                    lastMeasure.b.y - lastMeasure.a.y
                  )
                }
              >
                <Icon name="move" size={13} /> {t('Seçimi bu vektörle taşı')} {selCount > 0 && `(${selCount})`}
              </button>
              <button
                className="tsb-action"
                onClick={() => useStore.setState({ lastMeasure: null })}
              >
                <Icon name="close" size={13} /> {t('Temizle')}
              </button>
            </>
          ) : (
            <span className="tsb-hint">
              {t('Sürükleyerek ölçün (ızgaraya yaslanır, Shift: 45°) — sonra seçimi ölçülen vektörle taşıyabilirsiniz')}
            </span>
          )}
        </>
      )}

      {tool === 'select' && selCount > 0 && (
        <>
          <span className="tsb-label">{t('{n} nesne seçili', { n: selCount })}</span>
          {selectedTraces.length > 0 && (
            <>
              <span className="tsb-sep" />
              <span className="tsb-label">{t('İz genişliği')}:</span>
              <input
                className="tsb-num"
                type="number"
                step={0.05}
                min={0.1}
                value={selectedTraces[0].width}
                onChange={(e) => {
                  const w = parseFloat(e.target.value)
                  if (!w || w <= 0) return
                  commit((p) => {
                    for (const tr of p.traces) {
                      if (selection.traceIds.includes(tr.id)) tr.width = w
                    }
                  }, t('İz genişliği: {w} mm', { w }))
                }}
              />
              <span className="tsb-unit">mm</span>
            </>
          )}
          <span className="tsb-sep" />
          <button className="tsb-action" onClick={rotateSelection} title="R">
            ⟳ {t('Döndür')}
          </button>
          {!singleLayer && (
            <button className="tsb-action" onClick={flipSelection} title="F">
              ⇅ {t('Yüz Değiştir')}
            </button>
          )}
          <button className="tsb-action danger" onClick={deleteSelection} title="Del">
            <Icon name="trash" size={13} /> {t('Sil')}
          </button>
        </>
      )}

      {tool === 'select' && selCount === 0 && (
        <span className="tsb-hint">
          {t('Nesnelere tıklayın veya alan seçin — tek iz seçince köşe noktalarını sürükleyebilirsiniz')}
        </span>
      )}

      {tool === 'net' && (
        <span className="tsb-hint">
          {t('Pad\'e tıklayıp net adı verin (GND, VCC, SIG1...) — aynı addaki pad\'ler ratsnest ile bağlanır ve otorouter bunları çizer')}
        </span>
      )}

      {tool === 'delete' && (
        <span className="tsb-hint warn">{t('Silme modu — tıklanan nesne silinir (Ctrl+Z ile geri alınabilir)')}</span>
      )}
    </div>
  )
}
