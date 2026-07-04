// ─── Otorouter dialogu ────────────────────────────────────────────────────
// Rotalama ayarları (çözünürlük, iz genişliği, via cezası, boşluk) +
// çalıştırma ve sonuç günlüğü.

import { useState } from 'react'
import { useStore } from '../state/store'
import { analyzeNets } from '../core/netlist'
import { useT } from '../i18n'

export function AutorouteDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const autoroute = useStore((s) => s.autoroute)
  const mutateLive = useStore((s) => s.mutateLive)
  const t = useT()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    routed: number
    failed: string[]
    log: string[]
  } | null>(null)

  if (activeDialog !== 'autoroute') return null

  const analysis = analyzeNets(project, getFootprint)
  const airwireCount = analysis.airwires.length
  const singleLayer = project.board.layerCount === 1
  const s = project.settings

  const start = () => {
    setRunning(true)
    setResult(null)
    // UI'nin "çalışıyor" durumunu göstermesi için bir frame bekle
    setTimeout(() => {
      const r = autoroute()
      setResult(r)
      setRunning(false)
    }, 50)
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal autoroute-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🤖 {t('Otomatik Rotalama')}</h3>
          <button onClick={() => openDialog(null)}>✕</button>
        </div>
        <div className="export-body">
          <p>
            {t('A* algoritması eksik bağlantıları otomatik çizer: 45° rotalar, engellerden kaçınma ve tasarım kuralı (clearance) uyumu.')}{' '}
            {singleLayer
              ? t('Tek katman modu: yalnız üst bakır, via kullanılmaz.')
              : t('Çift katman: gerektiğinde otomatik via ile katman değiştirir.')}
          </p>

          <h4>{t('Rotalama ayarları')}</h4>
          <div className="gcode-options">
            <div className="field">
              <label>{t('İz genişliği (mm)')}</label>
              <input
                type="number"
                step={0.05}
                min={0.15}
                value={s.defaultTraceWidth}
                onChange={(e) =>
                  mutateLive((p) => {
                    p.settings.defaultTraceWidth = parseFloat(e.target.value) || 0.4
                  })
                }
              />
            </div>
            <div className="field">
              <label>{t('Bakır boşluğu (mm)')}</label>
              <input
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
            </div>
            <div className="field">
              <label>{t('Izgara çözünürlüğü')}</label>
              <select
                value={s.autorouteResolution}
                onChange={(e) =>
                  mutateLive((p) => {
                    p.settings.autorouteResolution = parseFloat(e.target.value)
                  })
                }
              >
                <option value={0.5}>0.5 mm — {t('hızlı')}</option>
                <option value={0.25}>0.25 mm — {t('dengeli')}</option>
                <option value={0.2}>0.2 mm — {t('hassas')}</option>
                <option value={0.15}>0.15 mm — {t('çok hassas (yavaş)')}</option>
              </select>
            </div>
            {!singleLayer && (
              <div className="field">
                <label>{t('Via cezası')}</label>
                <select
                  value={s.autorouteViaCost}
                  onChange={(e) =>
                    mutateLive((p) => {
                      p.settings.autorouteViaCost = parseFloat(e.target.value)
                    })
                  }
                >
                  <option value={10}>{t('Düşük — via serbest')}</option>
                  <option value={25}>{t('Normal')}</option>
                  <option value={60}>{t('Yüksek — az via')}</option>
                  <option value={200}>{t('Çok yüksek — mecbur kalmadıkça via yok')}</option>
                </select>
              </div>
            )}
          </div>

          <div className="autoroute-status">
            {airwireCount > 0 ? (
              <span className="warn">
                ⚡ {t('{n} eksik bağlantı rotalanmayı bekliyor', { n: airwireCount })}
              </span>
            ) : (
              <span className="ok">✓ {t('Tüm net bağlantıları tamamlanmış görünüyor')}</span>
            )}
          </div>
          <p className="calc-note">
            {t('İpucu: Netleri üç yolla verebilirsiniz — Şema modunda tel çizerek, Net (N) aracıyla pad\'e tıklayarak veya komponent seçip Pin/Net Editörü\'nü kullanarak.')}
          </p>
          <div className="modal-buttons">
            <button
              className="btn-primary"
              disabled={running || airwireCount === 0}
              onClick={start}
            >
              {running ? '⏳ ' + t('Rotalanıyor...') : '▶ ' + t('Rotalamayı Başlat')}
            </button>
          </div>
          {result && (
            <div className="autoroute-result">
              <h4>
                {t('Sonuç: {n} bağlantı rotalandı', { n: result.routed })}
                {result.failed.length > 0 &&
                  ', ' + t('{n} net başarısız', { n: result.failed.length })}
              </h4>
              <div className="autoroute-log">
                {result.log.map((line, i) => (
                  <div key={i} className={line.startsWith('✓') ? 'ok' : 'err'}>
                    {line}
                  </div>
                ))}
              </div>
              {result.failed.length > 0 && (
                <p className="calc-note">
                  {t('Başarısız netler için: kart alanını büyütün, iz genişliğini/çözünürlüğü küçültün veya elle rotalayın. Geri almak için Ctrl+Z.')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
