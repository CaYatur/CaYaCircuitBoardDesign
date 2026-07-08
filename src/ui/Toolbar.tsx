// ─── Üst araç çubuğu ──────────────────────────────────────────────────────

import { useStore } from '../state/store'
import { saveProjectFile, openProjectFile } from '../io/project'
import { useRecents } from '../state/recents'
import { usePrompt } from './prompts'
import { useI18n, useT } from '../i18n'

export function Toolbar() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
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
  const pinSilk = useStore((s) => s.project.settings.pinSilkLabels !== false)
  const padLabelMode = useStore((s) => s.project.settings.padLabelMode ?? 'off')
  // Pin gösterim modu: silk (pad yanı, üretim) / editör (ekran kaplaması) /
  // kapalı (silk yok; yalnız yaklaşınca pad içinde ad)
  const pinMode: 'silk' | 'editor' | 'closed' =
    pinSilk ? 'silk' : padLabelMode !== 'off' ? 'editor' : 'closed'
  const ask = usePrompt((s) => s.ask)
  const confirm = usePrompt((s) => s.confirm)
  const lang = useI18n((s) => s.lang)
  const setLang = useI18n((s) => s.setLang)
  const t = useT()

  /** Kaydedilmemiş değişiklik varsa üzerine yazmadan önce onay iste */
  const confirmDiscard = async (): Promise<boolean> => {
    const st = useStore.getState()
    if (!st.dirty) return true
    return confirm(t('Kaydedilmemiş değişiklikler var'), {
      message: t('Devam ederseniz mevcut projedeki kaydedilmemiş değişiklikler kaybolur. Önce Kaydet\'e basabilirsiniz.'),
      confirmLabel: 'Devam (kaydetme)',
      danger: true
    })
  }

  const handleNew = async () => {
    if (!(await confirmDiscard())) return
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
    if (!(await confirmDiscard())) return
    try {
      const res = await openProjectFile()
      if (res) {
        loadProject(res.project, res.path)
        if (!res.path) useRecents.getState().addWeb(res.project.name, JSON.stringify(res.project))
      }
    } catch (err: any) {
      setStatus(t('Proje açılamadı: {err}', { err: err?.message ?? err }))
    }
  }

  const doSave = async (saveAs: boolean) => {
    try {
      const st = useStore.getState()
      const res = await saveProjectFile(st.project, { path: st.currentProjectPath, saveAs })
      if (res) {
        st.markSaved()
        st.setProjectPath(res.path)
        if (!res.path) useRecents.getState().addWeb(st.project.name, JSON.stringify(st.project))
        else useRecents.getState().refresh()
        setStatus(t('"{name}" kaydedildi (.cayapcb)', { name: st.project.name }))
      }
    } catch (err: any) {
      setStatus(t('Kaydedilemedi: {err}', { err: err?.message ?? err }))
    }
  }
  const handleSave = () => doSave(false)

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
        <button
          title={t('Başlangıç ekranı (son kullanılanlar)')}
          onClick={() => useStore.getState().setShowStartScreen(true)}
        >
          🏠 {t('Başlangıç')}
        </button>
        <button title={t('Yeni Proje')} onClick={handleNew}>🗋 {t('Yeni')}</button>
        <button title={t('Proje Aç (.cayapcb)')} onClick={handleOpen}>📂 {t('Aç')}</button>
        <button title={t('Projeyi Kaydet')} onClick={handleSave}>💾 {t('Kaydet')}</button>
        <button title={t('Farklı Kaydet (yeni konum)')} onClick={() => doSave(true)}>
          {t('Farklı Kaydet')}
        </button>
      </div>

      <div className="toolbar-group">
        <button title={t('Geri Al') + ' (Ctrl+Z)'} onClick={undo} disabled={!canUndo}>↩</button>
        <button title={t('Yinele') + ' (Ctrl+Y)'} onClick={redo} disabled={!canRedo}>↪</button>
      </div>

      {mode === 'pcb' && (
        <>
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
            <label className="layer-select">
              {t('Pin')}:
              <select
                value={pinMode}
                title={t('Pin adı gösterimi: silk (pad yanı, üretim), editör (ekran kaplaması) veya kapalı (yalnız yaklaşınca pad içinde)')}
                onChange={(e) => {
                  const m = e.target.value as 'silk' | 'editor' | 'closed'
                  updateSettings((p) => {
                    p.settings.pinSilkLabels = m === 'silk'
                    p.settings.padLabelMode = m === 'editor' ? 'zoomed-out' : 'off'
                  })
                }}
              >
                <option value="silk">{t('Silk (üretim)')}</option>
                <option value="editor">{t('Editör (ekran)')}</option>
                <option value="closed">{t('Kapalı')}</option>
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
