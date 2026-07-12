// ─── Şema bilgileri / başlık bloğu düzenleme penceresi ────────────────────
// Profesyonel devre şeması sayfasının sağ-alt köşesindeki başlık bloğunu
// (TITLE / REV / Sheet / Date / tasarımcı + serbest açıklama notları) düzenler.
// Değişiklikler anında hem ekranda hem SVG/PNG dışa aktarımında görünür.

import { useStore } from '../state/store'
import { defaultTitleBlock, type TitleBlock } from '../types'
import { useT } from '../i18n'
import { Icon } from './Icon'

export function SchematicInfoDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const updateSettings = useStore((s) => s.updateSettings)
  const tb: TitleBlock = { ...defaultTitleBlock(), ...(useStore((s) => s.project.schematic.titleBlock) ?? {}) }
  const t = useT()

  if (activeDialog !== 'title-block') return null

  const set = (patch: Partial<TitleBlock>) =>
    updateSettings((p) => {
      p.schematic.titleBlock = { ...defaultTitleBlock(), ...(p.schematic.titleBlock ?? {}), ...patch }
    })

  const field = (label: string, key: keyof TitleBlock, placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input
        value={String(tb[key] ?? '')}
        placeholder={placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<TitleBlock>)}
      />
    </label>
  )

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal schematic-info-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="schematic" size={16} /> {t('Şema Bilgileri (Başlık Bloğu)')}</h3>
          <button onClick={() => openDialog(null)}><Icon name="close" size={14} /></button>
        </div>

        <label className="field field-check">
          <input
            type="checkbox"
            checked={tb.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <span>{t('Başlık bloğunu ve sayfa çerçevesini göster')}</span>
        </label>

        <div className="schematic-info-grid">
          {field(t('Başlık'), 'title', t('(boşsa proje adı)'))}
          {field(t('Firma'), 'company')}
          {field(t('Tasarlayan'), 'author')}
          {field(t('Revize eden'), 'revisedBy')}
          {field(t('Revizyon'), 'revision')}
          {field(t('Tarih'), 'date')}
          {field(t('Sayfa'), 'sheet', '1/1')}
          {field(t('Boyut'), 'size', 'A4')}
        </div>

        <label className="field">
          <span>{t('Açıklamalar / Notlar')}</span>
          <textarea
            rows={4}
            value={tb.notes}
            placeholder={t('Serbest notlar — her satır ayrı gösterilir (örn. VMAX=15V)')}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>

        <div className="modal-buttons">
          <button className="btn-primary" onClick={() => openDialog(null)}>
            <Icon name="check" size={14} /> {t('Tamam')}
          </button>
        </div>
      </div>
    </div>
  )
}
