// ─── DRC sonuç paneli ─────────────────────────────────────────────────────
// İhlal listesi; tıklanınca ilgili noktaya zoom yapılır.

import { useStore } from '../state/store'
import { useT } from '../i18n'
import { Icon } from './Icon'

export function DrcPanel() {
  const violations = useStore((s) => s.drcViolations)
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const setZoomTarget = useStore((s) => s.setZoomTarget)
  const runDrcNow = useStore((s) => s.runDrcNow)
  const t = useT()

  if (activeDialog !== 'drc') return null

  const errors = violations?.filter((v) => v.severity === 'error') ?? []
  const warnings = violations?.filter((v) => v.severity === 'warning') ?? []

  return (
    <div className="drc-panel">
      <div className="drc-header">
        <h3>
          {t('Tasarım Kuralı Denetimi')}{' '}
          {violations && (
            <span>
              — <span className="err">{t('{n} hata', { n: errors.length })}</span>,{' '}
              <span className="warn">{t('{n} uyarı', { n: warnings.length })}</span>
            </span>
          )}
        </h3>
        <div>
          <button onClick={runDrcNow}><Icon name="refresh" size={13} /> {t('Yeniden Çalıştır')}</button>
          <button onClick={() => openDialog(null)}><Icon name="close" size={14} /></button>
        </div>
      </div>
      <div className="drc-list">
        {violations && violations.length === 0 && (
          <div className="drc-clean"><Icon name="check" size={14} /> {t('Tebrikler — hiçbir kural ihlali bulunamadı!')}</div>
        )}
        {[...errors, ...warnings].map((v) => (
          <button
            key={v.id}
            className={`drc-item ${v.severity}`}
            onClick={() => setZoomTarget({ x: v.x, y: v.y })}
            title={t('Konuma zoom yap')}
          >
            <span className="drc-badge">
              {v.severity === 'error' ? t('HATA') : t('UYARI')}
            </span>
            <span className="drc-msg">{v.message}</span>
            <span className="drc-pos">
              ({v.x.toFixed(1)}, {v.y.toFixed(1)})
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
