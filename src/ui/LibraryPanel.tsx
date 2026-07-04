// ─── Komponent kütüphanesi paneli ─────────────────────────────────────────
// Yerleşik komponentler kategori bazlı; kullanıcının oluşturduğu komponentler
// ayrı "Kullanıcı Kütüphanem" bölümünde kendi kategorilerine göre gruplanır.
// Kullanıcı kütüphanesi otomatik kalıcıdır (PC/tarayıcı).

import { useMemo, useState } from 'react'
import type { Footprint } from '../types'
import { useStore } from '../state/store'
import { useUserLibrary } from '../state/userLibrary'
import { footprintCategories, builtinFootprints } from '../library/footprints'
import { exportFootprintLibrary, importFootprintLibrary } from '../io/project'
import { pickImageFile } from '../io/files'
import { usePrompt } from './prompts'
import { useT } from '../i18n'

export function LibraryPanel() {
  const [search, setSearch] = useState('')
  const [openCategory, setOpenCategory] = useState<string | null>('Mikrodenetleyici')
  const [openUserCat, setOpenUserCat] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; footprintId: string; custom: boolean } | null
  >(null)

  const startPlacing = useStore((s) => s.startPlacing)
  const placingId = useStore((s) => s.placingFootprintId)
  const openDialog = useStore((s) => s.openDialog)
  const setStatus = useStore((s) => s.setStatus)
  const openFootprintEditor = useStore((s) => s.openFootprintEditor)
  const startPlacingImage = useStore((s) => s.startPlacingImage)
  const mode = useStore((s) => s.mode)

  // Kullanıcı kütüphanesi (reaktif — değişince panel güncellenir)
  const userFps = useUserLibrary((s) => s.footprints)
  const userCats = useUserLibrary((s) => s.categories)
  const removeFootprint = useUserLibrary((s) => s.removeFootprint)
  const removeCategory = useUserLibrary((s) => s.removeCategory)
  const importFootprints = useUserLibrary((s) => s.importFootprints)
  const storagePath = useUserLibrary((s) => s.storagePath)
  const confirm = usePrompt((s) => s.confirm)
  const t = useT()

  const deleteUserCategory = async (cat: string) => {
    if (cat === 'Genel') return
    const count = userFps.filter((f) => (f.category || 'Genel') === cat).length
    const ok = await confirm(t('"{cat}" kategorisini sil?', { cat: t(cat) }), {
      message:
        count > 0
          ? t('İçindeki {n} komponent "Genel" kategorisine taşınacak. Emin misiniz?', { n: count })
          : t('Bu kategori silinecek. Emin misiniz?'),
      confirmLabel: 'Sil',
      danger: true
    })
    if (!ok) return
    removeCategory(cat)
    setStatus(t('"{cat}" kategorisi silindi', { cat: t(cat) }))
  }

  const matches = (f: Footprint, q: string) =>
    !q ||
    f.name.toLowerCase().includes(q) ||
    t(f.name).toLowerCase().includes(q) ||
    (f.description ?? '').toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q) ||
    t(f.category).toLowerCase().includes(q)

  const q = search.trim().toLowerCase()

  // Yerleşikler kategoriye göre (statik liste — yalnız arama/dil değişince yeniden)
  const builtinByCategory = useMemo(() => {
    const map = new Map<string, Footprint[]>()
    for (const cat of footprintCategories) map.set(cat, [])
    for (const f of builtinFootprints) {
      if (!matches(f, q)) continue
      if (!map.has(f.category)) map.set(f.category, [])
      map.get(f.category)!.push(f)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t])

  // Kullanıcı komponentleri kendi kategorilerine göre
  const userByCategory = useMemo(() => {
    const map = new Map<string, Footprint[]>()
    for (const cat of userCats) map.set(cat, [])
    for (const f of userFps) {
      if (!matches(f, q)) continue
      const cat = f.category || 'Genel'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(f)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFps, userCats, q, t])

  const userCount = userFps.filter((f) => matches(f, q)).length

  const handleAddImage = async () => {
    if (mode !== 'pcb') {
      setStatus(t('Görsel eklemek için PCB moduna geçin'))
      return
    }
    const picked = await pickImageFile()
    if (!picked) return
    const defW = 20
    const defH = Math.max(2, +(defW / (picked.aspect || 1)).toFixed(2))
    startPlacingImage({ src: picked.src, format: picked.format, width: defW, height: defH })
    setStatus(t('Görseli yerleştirmek için karta tıklayın (Esc: iptal)'))
  }

  const handleImport = async () => {
    try {
      const imported = await importFootprintLibrary()
      if (!imported) return
      const n = importFootprints(imported)
      setStatus(t('{n} footprint kullanıcı kütüphanesine aktarıldı (otomatik kayıtlı)', { n }))
    } catch (err: any) {
      setStatus(t('İçe aktarma hatası: {err}', { err: err?.message ?? err }))
    }
  }

  const handleExport = async () => {
    if (userFps.length === 0) {
      setStatus(t('Dışa aktarılacak komponent yok — önce Footprint editörüyle oluşturun'))
      return
    }
    await exportFootprintLibrary(userFps, 'caya-kullanici-kutuphane')
    setStatus(t('{n} komponent dışa aktarıldı (.cayalib)', { n: userFps.length }))
  }

  const placeFp = (f: Footprint) => {
    if (mode !== 'pcb') {
      setStatus(t('Komponent yerleştirmek için PCB moduna geçin'))
      return
    }
    startPlacing(placingId === f.id ? null : f.id)
  }

  const renderItem = (f: Footprint) => (
    <button
      key={f.id}
      className={`library-item ${placingId === f.id ? 'placing' : ''}`}
      title={f.description}
      onClick={() => placeFp(f)}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, footprintId: f.id, custom: !!f.custom })
      }}
    >
      <span className="item-name">
        {f.custom ? '★ ' : ''}{t(f.name)}
      </span>
      <span className="item-desc">{f.description}</span>
    </button>
  )

  const renderCategory = (
    cat: string,
    items: Footprint[],
    open: string | null,
    setOpen: (c: string | null) => void,
    deletable = false
  ) => {
    if (items.length === 0) return null
    const isOpen = q !== '' || open === cat
    return (
      <div key={cat} className="library-category">
        <div className="category-header-row">
          <button className="category-header" onClick={() => setOpen(isOpen ? null : cat)}>
            {isOpen ? '▾' : '▸'} {t(cat)}
            <span className="category-count">{items.length}</span>
          </button>
          {deletable && cat !== 'Genel' && (
            <button
              className="category-del"
              title={t('Kategoriyi sil (içindekiler Genel\'e taşınır)')}
              onClick={() => deleteUserCategory(cat)}
            >🗑</button>
          )}
        </div>
        {isOpen && items.map(renderItem)}
      </div>
    )
  }

  return (
    <div className="panel library-panel">
      <h3>{t('Komponent Kütüphanesi')}</h3>
      <input
        className="library-search"
        placeholder={t('🔍 Ara: arduino, esp, direnç...')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="library-list">
        {[...builtinByCategory.entries()].map(([cat, items]) =>
          renderCategory(cat, items, openCategory, setOpenCategory)
        )}

        {/* ── Kullanıcı Kütüphanem ── */}
        <div className="library-section-divider">
          ★ {t('Kullanıcı Kütüphanem')} <span>{userCount}</span>
        </div>
        {userCount === 0 ? (
          <p className="library-empty-note">
            {t('Henüz kendi komponentiniz yok. "＋ Yeni" ile oluşturun; otomatik kaydedilir.')}
          </p>
        ) : (
          [...userByCategory.entries()].map(([cat, items]) =>
            renderCategory(cat, items, openUserCat, setOpenUserCat, true)
          )
        )}
      </div>

      <div className="library-actions">
        <button
          onClick={() => openDialog('footprint-editor')}
          title={t('Kendi ölçülerinizle yeni komponent oluşturun')}
        >
          ＋ {t('Yeni')}
        </button>
        <button onClick={handleImport} title={t('Footprint kütüphanesi içe aktar (.cayalib)')}>
          ⇧ {t('İçe Al')}
        </button>
        <button onClick={handleExport} title={t('Kullanıcı komponentlerini dışa aktar (.cayalib)')}>
          ⇩ {t('Dışa Ver')}
        </button>
      </div>
      <div className="library-actions">
        <button
          className="lib-image-btn"
          onClick={handleAddImage}
          title={t('Karta SVG/PNG görsel (logo/işaret) ekle')}
        >
          🖼 {t('Görsel Ekle (SVG/PNG)')}
        </button>
      </div>
      {storagePath && (
        <div className="library-storage-note" title={storagePath}>
          💾 {t('Otomatik kayıt')}: {t('PC kütüphanesi')}
        </div>
      )}

      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}
          />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button
              onClick={() => {
                openFootprintEditor(contextMenu.footprintId)
                setContextMenu(null)
              }}
            >
              ✎ {contextMenu.custom ? t('Düzenle') : t('Kopyalayıp düzenle')}
            </button>
            {contextMenu.custom && (
              <button
                onClick={() => {
                  removeFootprint(contextMenu.footprintId)
                  setStatus(t('Komponent kullanıcı kütüphanesinden silindi'))
                  setContextMenu(null)
                }}
              >
                🗑 {t('Sil')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
