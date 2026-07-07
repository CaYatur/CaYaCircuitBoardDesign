// ─── Üst araç çubuğu ──────────────────────────────────────────────────────

import { useStore } from '../state/store'
import type { ToolId } from '../types'
import { saveProjectFile, openProjectFile } from '../io/project'
import { usePrompt } from './prompts'
import { useI18n, useT } from '../i18n'

const tools: { id: ToolId; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: '⬚', label: 'Seç', key: 'S' },
  { id: 'trace', icon: '〰', label: 'İz', key: 'T' },
  { id: 'via', icon: '◎', label: 'Via', key: 'V' },
  { id: 'zone', icon: '▦', label: 'Alan', key: '' },
  { id: 'text', icon: 'A', label: 'Yazı', key: '' },
  { id: 'net', icon: '⚡', label: 'Net', key: 'N' },
  { id: 'measure', icon: '📏', label: 'Ölçüm', key: 'M' },
  { id: 'delete', icon: '✕', label: 'Sil', key: '' }
]

export function Toolbar() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const openDialog = useStore((s) => s.openDialog)
  const runDrcNow = useStore((s) => s.runDrcNow)
  const project = useStore((s) => s.project)
  const loadProject = useStore((s) => s.loadProject)
  const resetProject = useStore((s) => s.resetProject)
  const setStatus = useStore((s) => s.setStatus)
  const commit = useStore((s) => s.commit)
  const updateSettings = useStore((s) => s.updateSettings)
  const gridSize = useStore((s) => s.project.settings.gridSize)
  const gridStyle = useStore((s) => s.project.settings.gridStyle ?? 'lines')
  const ask = usePrompt((s) => s.ask)
  const lang = useI18n((s) => s.lang)
  const setLang = useI18n((s) => s.setLang)
  const t = useT()

  const handleNew = async () => {
    const name = await ask(t('Yeni proje adı'), t('Yeni Proje'))
    if (name === null) return
    resetProject()
    if (name.trim()) {
      useStore.getState().commit((p) => {
        p.name = name.trim()
      })
      useStore.setState({ past: [] })
    }
    useStore.getState().markSaved()
  }

  const handleOpen = async () => {
    try {
      const p = await openProjectFile()
      if (p) loadProject(p)
    } catch (err: any) {
      setStatus(t('Proje açılamadı: {err}', { err: err?.message ?? err }))
    }
  }

  const handleSave = async () => {
    const ok = await saveProjectFile(project)
    if (ok) {
      useStore.getState().markSaved()
      setStatus(t('"{name}" kaydedildi (.cayapcb)', { name: project.name }))
    }
  }

  return (
    <div className="toolbar">
      <div
        className="toolbar-brand"
        title={t('CaYa PCB Studio — Geliştirici: CaYaDev · cayadev.com')}
      >
        <span className="brand-name">CaYa</span>
        <span className="brand-sub">PCB STUDIO</span>
      </div>

      <div className="mode-tabs">
        <button
          className={mode === 'schematic' ? 'active' : ''}
          onClick={() => setMode('schematic')}
          title={t('Devre şeması — teller PCB netlerine senkronlanır')}
        >
          ⌁ {t('Şema')}
        </button>
        <button
          className={mode === 'pcb' ? 'active' : ''}
          onClick={() => setMode('pcb')}
          title={t('Kart yerleşimi ve rotalama')}
        >
          ▦ PCB
        </button>
        <button
          className={mode === 'board' ? 'active' : ''}
          onClick={() => setMode('board')}
          title={t('Kart dış hattını ölçülü, profesyonel biçimde düzenleyin')}
        >
          ▧ {t('Kart Editörü')}
        </button>
        <button
          className={mode === 'view3d' ? 'active' : ''}
          onClick={() => setMode('view3d')}
          title={t('3B görünüm — kartı ve bileşenleri üç boyutlu görüntüleyin')}
        >
          ⬢ {t('3B Görünüm')}
        </button>
      </div>

      <div className="toolbar-group">
        <button title={t('Yeni Proje')} onClick={handleNew}>🗋 {t('Yeni')}</button>
        <button title={t('Proje Aç (.cayapcb)')} onClick={handleOpen}>📂 {t('Aç')}</button>
        <button title={t('Projeyi Kaydet')} onClick={handleSave}>💾 {t('Kaydet')}</button>
      </div>

      <div className="toolbar-group">
        <button title={t('Geri Al') + ' (Ctrl+Z)'} onClick={undo} disabled={!canUndo}>↩</button>
        <button title={t('Yinele') + ' (Ctrl+Y)'} onClick={redo} disabled={!canRedo}>↪</button>
      </div>

      {mode === 'pcb' && (
        <>
          <div className="toolbar-group tools">
            {tools.map((tl) => (
              <button
                key={tl.id}
                className={tool === tl.id ? 'active' : ''}
                title={`${t(tl.label)}${tl.key ? ` (${tl.key})` : ''}`}
                onClick={() => setTool(tl.id)}
              >
                <span className="tool-icon">{tl.icon}</span>
                <span className="tool-label">{t(tl.label)}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-group">
            <label className="layer-select">
              {t('Izgara')}:
              <select
                value={gridSize}
                onChange={(e) =>
                  commit((p) => {
                    p.settings.gridSize = parseFloat(e.target.value)
                  }, t('Izgara: {g} mm', { g: e.target.value }))
                }
              >
                <option value={2.54}>2.54</option>
                <option value={1.27}>1.27</option>
                <option value={0.635}>0.635</option>
                <option value={0.5}>0.5</option>
                <option value={0.25}>0.25</option>
                <option value={0.1}>0.1</option>
              </select>
            </label>
            <label className="layer-select">
              {t('Görünüm')}:
              <select
                value={gridStyle}
                title={t('Izgara görünümü')}
                onChange={(e) =>
                  updateSettings((p) => {
                    p.settings.gridStyle = e.target.value as typeof gridStyle
                  })
                }
              >
                <option value="lines">{t('Çizgi')}</option>
                <option value="dots">{t('Nokta')}</option>
                <option value="off">{t('Kapalı')}</option>
              </select>
            </label>
          </div>
        </>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button title={t('Otomatik rotalama')} onClick={() => openDialog('autoroute')}>
          🤖 {t('Otoroute')}
        </button>
        <button title={t('Tasarım kuralı denetimi')} onClick={runDrcNow}>
          ✔ DRC
        </button>
        <button title={t('Elektriksel hesaplayıcılar')} onClick={() => openDialog('calculators')}>
          🧮 {t('Hesap')}
        </button>
        <button title={t('Footprint editörü')} onClick={() => openDialog('footprint-editor')}>
          ⬡ Footprint
        </button>
        <button title={t('Kart ayarları ve tasarım kuralları')} onClick={() => openDialog('board-settings')}>
          ⚙ {t('Kart')}
        </button>
        <button title={t('Uygulama ayarları (bağlantı takibi vb.)')} onClick={() => openDialog('settings')}>
          ⚙ {t('Ayarlar')}
        </button>
        <button className="btn-accent" title={t('Dışa aktar')} onClick={() => openDialog('export')}>
          ⇩ {t('Dışa Aktar')}
        </button>
      </div>

      <div className="toolbar-group">
        <select
          className="lang-select"
          value={lang}
          onChange={(e) => setLang(e.target.value as 'tr' | 'en')}
          title={t('Dil / Language')}
        >
          <option value="tr">🇹🇷 TR</option>
          <option value="en">🇬🇧 EN</option>
        </select>
      </div>
    </div>
  )
}
