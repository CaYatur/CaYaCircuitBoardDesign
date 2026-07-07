// ─── Uygulama / Etkileşim Ayarları ────────────────────────────────────────
// Bağlantı takibi (rubber-band) ve kaydedilmemiş değişiklik uyarısı gibi
// davranış ayarları. Değişiklikler undo geçmişini kirletmez (updateSettings).

import { useStore } from '../state/store'
import type { ConnectionFollowSettings } from '../types'
import { useT } from '../i18n'

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
  )
}

export function SettingsDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const cf = useStore((s) => s.project.settings.connectionFollow)
  const warnOnUnsavedClose = useStore((s) => s.project.settings.warnOnUnsavedClose)
  const clearNetsOnPathDelete = useStore((s) => s.project.settings.clearNetsOnPathDelete ?? true)
  const schematicStandardSymbols = useStore((s) => s.project.settings.schematicStandardSymbols ?? true)
  const updateSettings = useStore((s) => s.updateSettings)
  const t = useT()

  if (activeDialog !== 'settings') return null

  const setCf = (patch: Partial<ConnectionFollowSettings>) =>
    updateSettings((p) => {
      p.settings.connectionFollow = { ...p.settings.connectionFollow, ...patch }
    })

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙ {t('Ayarlar')}</h3>
          <button onClick={() => openDialog(null)}>✕</button>
        </div>

        {/* ── Bağlantı takibi ── */}
        <div className="settings-section">
          <h4>{t('Bağlantı takibi (izleri sürükle)')}</h4>
          <p className="settings-desc">
            {t('Bir komponent, via veya iz taşındığında ona bağlı iz ve tel uçları birlikte hareket eder; bağlantı kopmaz. Kapatırsanız eski davranış (bağlantılar sabit kalır) geçerli olur.')}
          </p>

          <div className="settings-row">
            <span className="settings-label">
              {t('Bağlantı takibini etkinleştir')}
              <small>{t('Varsayılan: açık')}</small>
            </span>
            <Toggle checked={cf.enabled} onChange={(v) => setCf({ enabled: v })} />
          </div>

          <div className={'settings-row' + (cf.enabled ? '' : ' disabled')}>
            <span className="settings-label">
              {t('Takip kapsamı')}
              <small>
                {t('Uçlar: yalnız pad merkezine oturan iz uçları · Tümü: pad\'e değen tüm köşe noktaları')}
              </small>
            </span>
            <select
              value={cf.scope}
              onChange={(e) => setCf({ scope: e.target.value as 'endpoints' | 'all' })}
            >
              <option value="endpoints">{t('Yalnız uçlar')}</option>
              <option value="all">{t('Değen tüm noktalar')}</option>
            </select>
          </div>

          <div className={'settings-row' + (cf.enabled ? '' : ' disabled')}>
            <span className="settings-label">
              {t('Bağlı viaları da taşı')}
              <small>{t('Bir pad üzerine oturan via komponentle birlikte hareket eder')}</small>
            </span>
            <Toggle checked={cf.dragVias} onChange={(v) => setCf({ dragVias: v })} />
          </div>

          <div className={'settings-row' + (cf.enabled ? '' : ' disabled')}>
            <span className="settings-label">
              {t('Bırakınca izleri düzelt')}
              <small>{t('Taşıma bitince (anlık değil) bağlı izler az bozmayla toparlanır')}</small>
            </span>
            <Toggle checked={cf.reflowOnDrop} onChange={(v) => setCf({ reflowOnDrop: v })} />
          </div>

          <div className={'settings-row' + (cf.enabled ? '' : ' disabled')}>
            <span className="settings-label">
              {t('Bağlantı toleransı')}
              <small>{t('Bu mesafedeki (mm) uçlar "bağlı" sayılır')}</small>
            </span>
            <input
              type="number"
              step={0.01}
              min={0.001}
              value={cf.tolerance}
              onChange={(e) => setCf({ tolerance: Math.max(0.001, parseFloat(e.target.value) || 0.001) })}
            />
          </div>
        </div>

        {/* ── Şema & Netler ── */}
        <div className="settings-section">
          <h4>{t('Şema & Netler')}</h4>

          <div className="settings-row">
            <span className="settings-label">
              {t('Yol silinince net atamalarını temizle')}
              <small>{t('Bir tel (şema) veya iz (PCB) silindiğinde, yalnız o yolun verdiği ve başka bağlantıyla desteklenmeyen net atamaları da kaldırılır. Varsayılan: açık')}</small>
            </span>
            <Toggle
              checked={clearNetsOnPathDelete}
              onChange={(v) => updateSettings((p) => { p.settings.clearNetsOnPathDelete = v })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">
              {t('Standart şema sembolleri')}
              <small>{t('Pasif bileşenleri (direnç, kondansatör, diyot/LED, bobin, kristal) standart devre şeması sembolleriyle göster. Kapalıysa hepsi kutu sembolüdür. Varsayılan: açık')}</small>
            </span>
            <Toggle
              checked={schematicStandardSymbols}
              onChange={(v) => updateSettings((p) => { p.settings.schematicStandardSymbols = v })}
            />
          </div>
        </div>

        {/* ── Genel ── */}
        <div className="settings-section">
          <h4>{t('Genel')}</h4>
          <div className="settings-row">
            <span className="settings-label">
              {t('Kapatırken kaydedilmemiş değişiklik uyarısı')}
              <small>{t('Kaydedilmemiş işiniz varken uygulamayı kapatmadan önce sorar')}</small>
            </span>
            <Toggle
              checked={warnOnUnsavedClose}
              onChange={(v) => updateSettings((p) => { p.settings.warnOnUnsavedClose = v })}
            />
          </div>
        </div>

        <div className="modal-buttons">
          <button className="btn-primary" onClick={() => openDialog(null)}>
            {t('Tamam')}
          </button>
        </div>
      </div>
    </div>
  )
}
