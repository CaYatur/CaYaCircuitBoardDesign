// ─── Uygulama / Etkileşim Ayarları ────────────────────────────────────────
// Bağlantı takibi (rubber-band) ve kaydedilmemiş değişiklik uyarısı gibi
// davranış ayarları. Değişiklikler undo geçmişini kirletmez (updateSettings).

import { useStore } from '../state/store'
import type { ConnectionFollowSettings } from '../types'
import { usePrompt } from './prompts'
import { useT } from '../i18n'
import { Icon } from './Icon'

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
  const clearNetsPcb = useStore((s) => s.project.settings.clearNetsOnPathDeletePcb ?? false)
  const clearNetsSchematic = useStore((s) => s.project.settings.clearNetsOnPathDeleteSchematic ?? true)
  const removePcbTracesOnSchematicChange = useStore((s) => s.project.settings.removePcbTracesOnSchematicChange ?? true)
  const schematicStandardSymbols = useStore((s) => s.project.settings.schematicStandardSymbols ?? true)
  const padLabelMode = useStore((s) => s.project.settings.padLabelMode ?? 'off')
  const pinSilkLabels = useStore((s) => s.project.settings.pinSilkLabels !== false)
  const pinSilkShowOnPad = useStore((s) => s.project.settings.pinSilkShowOnPad !== false)
  const padLabelRespectCustomFootprintPos = useStore(
    (s) => s.project.settings.padLabelRespectCustomFootprintPos ?? true
  )
  const padLabelAutoHideCrowded = useStore(
    (s) => s.project.settings.padLabelAutoHideCrowded ?? true
  )
  const updateSettings = useStore((s) => s.updateSettings)
  const clearAllConnections = useStore((s) => s.clearAllConnections)
  const confirm = usePrompt((s) => s.confirm)
  const t = useT()

  if (activeDialog !== 'settings') return null

  const doClear = async (
    scope: 'all' | 'nets' | 'traces' | 'wires',
    label: string
  ) => {
    const ok = await confirm(t('Emin misiniz?'), {
      message: label,
      confirmLabel: 'Temizle',
      danger: true
    })
    if (ok) clearAllConnections(scope)
  }

  const setCf = (patch: Partial<ConnectionFollowSettings>) =>
    updateSettings((p) => {
      p.settings.connectionFollow = { ...p.settings.connectionFollow, ...patch }
    })

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="gear" size={16} /> {t('Ayarlar')}</h3>
          <button onClick={() => openDialog(null)}><Icon name="close" size={14} /></button>
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
              {t('Şemada tel silinince net atamalarını temizle')}
              <small>{t('Şema tarafında bir tel silindiğinde, yalnız o telin verdiği ve başka telle desteklenmeyen net atamaları da kaldırılır. Varsayılan: açık')}</small>
            </span>
            <Toggle
              checked={clearNetsSchematic}
              onChange={(v) => updateSettings((p) => { p.settings.clearNetsOnPathDeleteSchematic = v })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">
              {t('PCB\'de iz silinince net atamalarını temizle')}
              <small>{t('PCB tarafında bir iz silindiğinde, yalnız o izin verdiği ve başka izle desteklenmeyen net atamaları da kaldırılır. Varsayılan: kapalı')}</small>
            </span>
            <Toggle
              checked={clearNetsPcb}
              onChange={(v) => updateSettings((p) => { p.settings.clearNetsOnPathDeletePcb = v })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">
              {t('Şema değişince eski PCB izlerini kaldır')}
              <small>{t('Şemada bir bağlantı değişince (tel silme/rename), o pine bağlı ESKİ nete ait PCB izleri de kaldırılır; böylece PCB yönlendirmesi şema ile tutarlı kalır. Varsayılan: açık')}</small>
            </span>
            <Toggle
              checked={removePcbTracesOnSchematicChange}
              onChange={(v) => updateSettings((p) => { p.settings.removePcbTracesOnSchematicChange = v })}
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

          <div className="settings-row settings-actions-row">
            <span className="settings-label">
              {t('Bağlantıları temizle')}
              <small>{t('Seçtiğiniz bağlantıları tek adımda kaldırır. Geri almak için Ctrl+Z.')}</small>
            </span>
            <div className="settings-action-buttons">
              <button
                className="btn-secondary"
                onClick={() => doClear('traces', t('Tüm PCB izleri ve viaları silinecek.'))}
              >
                {t('PCB izleri')}
              </button>
              <button
                className="btn-secondary"
                onClick={() => doClear('nets', t('Tüm pad net atamaları temizlenecek.'))}
              >
                {t('Net atamaları')}
              </button>
              <button
                className="btn-secondary"
                onClick={() => doClear('wires', t('Tüm şema telleri silinecek.'))}
              >
                {t('Şema telleri')}
              </button>
              <button
                className="btn-secondary btn-danger"
                onClick={() => doClear('all', t('Tüm PCB izleri, viaları, net atamaları ve şema telleri silinecek.'))}
              >
                {t('Tümü')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Görünüm ── */}
        <div className="settings-section">
          <h4>{t('Görünüm')}</h4>
          <div className="settings-row">
            <span className="settings-label">
              {t('Silk pin adları')}
              <small>{t('Her pad\'in adı/numarası silkscreen katmanında pad\'in içine yazı olarak çizilir ve tüm silk dışa aktarımlarına (Gerber/SVG/PNG) dahil edilir. Yerleşik ve kullanıcı footprint\'lerinin hepsinde otomatiktir. Pinlerin varsayılan gösterimidir. Varsayılan: açık')}</small>
            </span>
            <Toggle
              checked={pinSilkLabels}
              onChange={(v) => updateSettings((p) => { p.settings.pinSilkLabels = v })}
            />
          </div>
          {pinSilkLabels && (
            <div className="settings-row settings-row-sub">
              <span className="settings-label">
                {t('Pad\'e yakınlaşınca adı pad içinde de göster')}
                <small>{t('Silk pin adları açıkken, pad\'e yeterince yakınlaşıldığında ad silk yazısına ek olarak pad\'in içinde de gösterilir. Kapalıysa yalnızca silk yazısı (pad yanı) görünür. Varsayılan: açık')}</small>
              </span>
              <Toggle
                checked={pinSilkShowOnPad}
                onChange={(v) => updateSettings((p) => { p.settings.pinSilkShowOnPad = v })}
              />
            </div>
          )}
          <div className="settings-row">
            <span className="settings-label">
              {t('Editör pin adları (ekran üstü)')}
              <small>{t('Yalnız ekranda görünen (dışa aktarılmayan) pad adı kaplaması. Silk pin adlarından ayrıdır; ekstra bir "editör görünümü" olarak istenirse açılır. Varsayılan: kapalı (yalnız pad içi).')}</small>
            </span>
            <select
              value={padLabelMode}
              onChange={(e) =>
                updateSettings((p) => {
                  p.settings.padLabelMode = e.target.value as typeof padLabelMode
                })
              }
            >
              <option value="off">{t('Kapalı (yalnız pad içi, varsayılan)')}</option>
              <option value="zoomed-out">{t('Uzaklaşınca yanında')}</option>
              <option value="always">{t('Her zaman yanında')}</option>
            </select>
          </div>

          <div className="settings-row">
            <span className="settings-label">
              {t('Özel footprint etiket konumuna öncelik ver')}
              <small>
                {t(
                  'Kullanıcı tanımlı footprint\'lerde footprint editöründe elle taşınmış pad adı varsa PCB\'de de aynı konumda gösterilir. Kapalıysa PCB her zaman otomatik/simetrik yerleşimi kullanır. Yerleşik footprint\'leri etkilemez. Varsayılan: açık'
                )}
              </small>
            </span>
            <Toggle
              checked={padLabelRespectCustomFootprintPos}
              onChange={(v) => updateSettings((p) => { p.settings.padLabelRespectCustomFootprintPos = v })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">
              {t('Sığmayınca pin adlarını otomatik gizle')}
              <small>
                {t(
                  'Kart dışında gösterilen pin adları çakışacak veya kart dışına taşacak kadar sıkışırsa, o bileşenin tüm pin adları (özel konumlananlar dahil) birlikte gizlenir. Kapalıysa yer olmasa da her zaman gösterilir. Varsayılan: açık'
                )}
              </small>
            </span>
            <Toggle
              checked={padLabelAutoHideCrowded}
              onChange={(v) => updateSettings((p) => { p.settings.padLabelAutoHideCrowded = v })}
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
