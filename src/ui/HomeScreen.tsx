// ─── Başlangıç ekranı ─────────────────────────────────────────────────────
// Uygulama açılışında ve "Başlangıç" ile gösterilir: yeni proje, proje aç,
// son kullanılanlar. Masaüstünde yollar hatırlanır; web'de anlık görüntüler.

import { useEffect } from 'react'
import { useStore } from '../state/store'
import { useRecents, type RecentEntry } from '../state/recents'
import { openProjectFile, validateProject } from '../io/project'
import { isDesktop } from '../io/native'
import { usePrompt } from './prompts'
import { useT } from '../i18n'

function timeAgo(at: number, t: (k: string, p?: any) => string): string {
  const s = Math.floor((Date.now() - at) / 1000)
  if (s < 60) return t('az önce')
  const m = Math.floor(s / 60)
  if (m < 60) return t('{n} dk önce', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('{n} sa önce', { n: h })
  const d = Math.floor(h / 24)
  return t('{n} gün önce', { n: d })
}

export function HomeScreen() {
  const show = useStore((s) => s.showStartScreen)
  const resetProject = useStore((s) => s.resetProject)
  const loadProject = useStore((s) => s.loadProject)
  const setShowStartScreen = useStore((s) => s.setShowStartScreen)
  const setStatus = useStore((s) => s.setStatus)
  const entries = useRecents((s) => s.entries)
  const refresh = useRecents((s) => s.refresh)
  const getWebJson = useRecents((s) => s.getWebJson)
  const addWeb = useRecents((s) => s.addWeb)
  const clear = useRecents((s) => s.clear)
  const confirm = usePrompt((s) => s.confirm)
  const t = useT()

  useEffect(() => {
    if (show) refresh()
  }, [show, refresh])

  if (!show) return null

  /**
   * Mevcut projede kaydedilmemiş değişiklik varsa, üzerine yeni/başka proje
   * açmadan önce onay iste (yanlışlıkla kaybolmayı önler).
   */
  const confirmDiscard = async (): Promise<boolean> => {
    const st = useStore.getState()
    if (!st.dirty) return true
    return confirm(t('Kaydedilmemiş değişiklikler var'), {
      message: t(
        'Mevcut projedeki ("{name}") kaydedilmemiş değişiklikler devam ederseniz KAYBOLUR. Kaydetmek için önce "Editöre geç" ile dönüp Kaydet\'e basın.',
        { name: st.project.name }
      ),
      confirmLabel: 'Devam (kaydetme)',
      danger: true
    })
  }

  const openRecent = async (e: RecentEntry) => {
    if (!(await confirmDiscard())) return
    try {
      if (e.path) {
        const res = await openProjectFile({ path: e.path })
        if (res) loadProject(res.project, res.path)
      } else if (e.id) {
        const json = getWebJson(e.id)
        if (!json) {
          setStatus(t('Bu proje artık bulunamadı'))
          return
        }
        loadProject(validateProject(JSON.parse(json)), null)
      }
    } catch (err: any) {
      setStatus(t('Proje açılamadı: {err}', { err: err?.message ?? err }))
    }
  }

  const openDialog = async () => {
    if (!(await confirmDiscard())) return
    try {
      const res = await openProjectFile()
      if (res) {
        loadProject(res.project, res.path)
        // Web: açılan projeyi de son kullanılanlara ekle
        if (!res.path) addWeb(res.project.name, JSON.stringify(res.project))
      }
    } catch (err: any) {
      setStatus(t('Proje açılamadı: {err}', { err: err?.message ?? err }))
    }
  }

  return (
    <div className="home-backdrop">
      <div className="home-card">
        <div className="home-hero">
          <div className="home-brand">
            <span className="home-brand-name">CaYa</span>
            <span className="home-brand-sub">PCB STUDIO</span>
          </div>
          <p className="home-tag">{t('Devre kartı tasarımına başlayın')}</p>
        </div>

        <div className="home-actions">
          <button
            className="home-action home-action-primary"
            onClick={async () => {
              if (await confirmDiscard()) resetProject()
            }}
          >
            <span className="home-action-icon">➕</span>
            <span className="home-action-title">{t('Yeni Proje')}</span>
            <span className="home-action-desc">{t('Boş bir kartla başla')}</span>
          </button>
          <button className="home-action" onClick={openDialog}>
            <span className="home-action-icon">📂</span>
            <span className="home-action-title">{t('Proje Aç')}</span>
            <span className="home-action-desc">
              {isDesktop() ? t('Bilgisayardan .cayapcb seç') : t('Dosyadan .cayapcb yükle')}
            </span>
          </button>
        </div>

        <div className="home-recents">
          <div className="home-recents-head">
            <h4>{t('Son kullanılanlar')}</h4>
            {entries.length > 0 && (
              <button className="home-clear" onClick={() => clear()}>
                {t('Temizle')}
              </button>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="home-empty">{t('Henüz proje yok — yeni bir proje oluşturun.')}</p>
          ) : (
            <div className="home-recent-list">
              {entries.map((e, i) => (
                <button key={e.path ?? e.id ?? i} className="home-recent" onClick={() => openRecent(e)}>
                  <span className="home-recent-icon">▦</span>
                  <span className="home-recent-info">
                    <span className="home-recent-name">{e.name}</span>
                    {e.path && <span className="home-recent-path" title={e.path}>{e.path}</span>}
                  </span>
                  <span className="home-recent-time">{timeAgo(e.at, t)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="home-skip" onClick={() => setShowStartScreen(false)}>
          {t('Editöre geç →')}
        </button>
      </div>
    </div>
  )
}
