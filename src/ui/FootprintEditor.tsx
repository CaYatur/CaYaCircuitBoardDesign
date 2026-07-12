// ─── Özel footprint editörü ───────────────────────────────────────────────
// Kullanıcı kendi ölçüleriyle komponent oluşturur veya HAZIR footprint'leri
// düzenler (yerleşikler kopyalanarak özelleştirilir). Üç sekme:
//   ⬡ Kılıf (PCB)   — kart editörü benzeri araçlarla pad/silk/dış hat çizimi
//   ⌁ Şema Sembolü  — footprint'e özel şema sembolü tasarımı
//   ⬢ 3B Model      — parametrik gövde veya OBJ/STL model + renk
// Kaydedilenler kullanıcı kütüphanesinde kalıcıdır, .cayalib paylaşılabilir.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useUserLibrary } from '../state/userLibrary'
import type {
  Footprint,
  FootprintModel3D,
  FootprintModelLabel,
  PadDef,
  Point,
  SilkElement,
  SymbolDef,
  SymbolPrim
} from '../types'
import { newProject, uid } from '../types'
import { pinLabelPlacement } from '../core/pinSilk'
import { segPointDist } from '../core/geometry'
import { SCH_GRID, symbolLayout } from '../schematic/model'
import { schematicGlyph } from '../schematic/symbols'
import { render3D, fit3DCamera, type Camera } from '../render/render3d'
import { loadFootprintMeshFromFile, pickModelFile } from '../io/model3d'
import { usePrompt } from './prompts'
import { useT } from '../i18n'
import { Icon } from './Icon'

const emptyPad = (n: number): PadDef => ({
  name: `${n}`,
  x: 0,
  y: 0,
  shape: 'circle',
  width: 1.7,
  height: 1.7,
  drill: 0.9,
  layer: 'both'
})

/** Dış hat poligonundan silkscreen çizgileri üret */
function outlineLines(points: Point[]): SilkElement[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]
    return { kind: 'line', x1: p.x, y1: p.y, x2: q.x, y2: q.y, width: 0.2 } as SilkElement
  })
}

/** Silk listesinden dış hat poligonuna ait çizgileri ayıkla (yüklerken) */
function stripOutlineLines(silk: SilkElement[], outline: Point[]): SilkElement[] {
  const k = (n: number) => n.toFixed(2)
  const segs = new Set<string>()
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    segs.add(`${k(a.x)},${k(a.y)}-${k(b.x)},${k(b.y)}`)
    segs.add(`${k(b.x)},${k(b.y)}-${k(a.x)},${k(a.y)}`)
  }
  return silk.filter(
    (e) =>
      e.kind !== 'line' ||
      !segs.has(`${k(e.x1)},${k(e.y1)}-${k(e.x2)},${k(e.y2)}`)
  )
}

/** Sembol pinlerini pad listesiyle eşitle (eksik ekle, fazlaları çıkar) */
function reconcileSymbolPins(sym: SymbolDef, pads: PadDef[]): SymbolDef {
  const padNames = pads.filter((p) => !p.name.startsWith('MH')).map((p) => p.name)
  const existing = new Map(sym.pins.map((p) => [p.name, p]))
  const pins = padNames.map((name, i) => {
    const cur = existing.get(name)
    if (cur) return cur
    // eksik pin: sol tarafta en alta ekle
    const leftYs = sym.pins.filter((p) => p.side === 'left').map((p) => p.y)
    const y = (leftYs.length ? Math.max(...leftYs) : -SCH_GRID) + SCH_GRID * (i * 0 + 1)
    return { name, x: 0, y, side: 'left' as const }
  })
  return { ...sym, pins }
}

export function FootprintEditor() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const target = useStore((s) => s.footprintEditorTarget)
  const getFootprint = useStore((s) => s.getFootprint)
  const setStatus = useStore((s) => s.setStatus)
  // Kullanıcı kütüphanesi (global, otomatik kalıcı)
  const customFootprints = useUserLibrary((s) => s.footprints)
  const categories = useUserLibrary((s) => s.categories)
  const saveFootprint = useUserLibrary((s) => s.saveFootprint)
  const removeFootprint = useUserLibrary((s) => s.removeFootprint)
  const addCategory = useUserLibrary((s) => s.addCategory)
  const removeCategory = useUserLibrary((s) => s.removeCategory)
  const confirm = usePrompt((s) => s.confirm)
  const t = useT()

  const askDeleteCategory = async (cat: string) => {
    if (cat === 'Genel') return
    const count = customFootprints.filter((f) => (f.category || 'Genel') === cat).length
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
    setStatus(t('"{cat}" kategorisi silindi — komponentleri Genel\'e taşındı', { cat: t(cat) }))
    setCategory('Genel')
  }

  const [name, setName] = useState('')
  const [category, setCategory] = useState('Genel')
  const [description, setDescription] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [bodyW, setBodyW] = useState(10)
  const [bodyH, setBodyH] = useState(10)
  const [pads, setPads] = useState<PadDef[]>([emptyPad(1), emptyPad(2)])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  // Elle çizilmiş gövde/dış hat poligonu (null → dikdörtgen gövde)
  const [bodyOutline, setBodyOutline] = useState<Point[] | null>(null)
  // Kullanıcının düzenlediği silkscreen öğeleri (dış hat çizgileri HARİÇ)
  const [silk, setSilk] = useState<SilkElement[]>([])
  // Özel şema sembolü (null → otomatik kutu/standart glif)
  const [symbolDef, setSymbolDef] = useState<SymbolDef | null>(null)
  // Özel 3B model (null → kategoriye göre otomatik)
  const [model3d, setModel3d] = useState<FootprintModel3D | null>(null)
  // Aktif tasarım sekmesi
  const [tab, setTab] = useState<'pcb' | 'symbol' | 'model3d'>('pcb')

  // Tam ekran (büyütülmüş) düzen — çizim alanı ekranı kaplasın (daha kolay
  // düzenleme). Açıkken modal genişler ve tuval boyutu viewport'a göre büyür.
  const [maximized, setMaximized] = useState(false)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    if (!maximized) return
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [maximized])
  // Tuval piksel boyutu: normalde 500×400; tam ekranda viewport'a sığdırılır.
  const fpCanvasW = maximized ? Math.max(500, Math.round(vp.w * 0.96) - 470) : 500
  const fpCanvasH = maximized ? Math.max(400, Math.round(vp.h * 0.94) - 190) : 400

  // Hızlı üreteç durumu
  const [genRows, setGenRows] = useState(1)
  const [genCols, setGenCols] = useState(4)
  const [genPitch, setGenPitch] = useState(2.54)
  const [genRowSpacing, setGenRowSpacing] = useState(7.62)

  // ── Yerel geri al / yinele geçmişi (Ctrl+Z / Ctrl+Y) ──
  // Tasarım durumunun (pad + silk + dış hat + sembol + 3B model + gövde)
  // anlık görüntüleri; canvas ve tablo düzenlemelerinin tümünü kapsar.
  const histRef = useRef<{ stack: string[]; idx: number; muted: boolean }>({
    stack: [],
    idx: -1,
    muted: false
  })
  const snapNow = JSON.stringify({ pads, silk, bodyOutline, symbolDef, model3d, bodyW, bodyH })
  useEffect(() => {
    if (activeDialog !== 'footprint-editor') return
    const h = histRef.current
    if (h.muted) {
      h.muted = false
      return
    }
    if (h.stack[h.idx] === snapNow) return
    h.stack = h.stack.slice(0, h.idx + 1)
    h.stack.push(snapNow)
    if (h.stack.length > 80) h.stack.shift()
    h.idx = h.stack.length - 1
  }, [snapNow, activeDialog])

  const applySnap = (json: string) => {
    const sn = JSON.parse(json) as {
      pads: PadDef[]
      silk: SilkElement[]
      bodyOutline: Point[] | null
      symbolDef: SymbolDef | null
      model3d: FootprintModel3D | null
      bodyW: number
      bodyH: number
    }
    histRef.current.muted = true
    setPads(sn.pads)
    setSilk(sn.silk)
    setBodyOutline(sn.bodyOutline)
    setSymbolDef(sn.symbolDef)
    setModel3d(sn.model3d)
    setBodyW(sn.bodyW)
    setBodyH(sn.bodyH)
  }

  // ── Kaydedilmemiş değişiklik takibi (panel kapatılırken uyarmak için) ──
  // baselineRef = son yükleme/sıfırlama/kayıt anındaki durum; her render'da
  // güncel duruma karşılaştırılır. baselineTick, yükleme/sıfırlama/kayıttan
  // sonra render'ın GÜNCEL state'i baseline'a yazması için tetikleyici.
  const dirtySnap = JSON.stringify({
    name, category, description, pads, silk, bodyOutline, symbolDef, model3d, bodyW, bodyH
  })
  const baselineRef = useRef<string | null>(null)
  const [baselineTick, setBaselineTick] = useState(0)
  useEffect(() => {
    baselineRef.current = dirtySnap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineTick])
  const isDirty = baselineRef.current !== null && baselineRef.current !== dirtySnap
  const [closeConfirm, setCloseConfirm] = useState(false)

  useEffect(() => {
    if (activeDialog !== 'footprint-editor') return
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return
      const h = histRef.current
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.stopImmediatePropagation() // proje editörünün undo'su tetiklenmesin
        if (e.shiftKey) {
          if (h.idx < h.stack.length - 1) { h.idx++; applySnap(h.stack[h.idx]) }
        } else if (h.idx > 0) {
          h.idx--
          applySnap(h.stack[h.idx])
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (h.idx < h.stack.length - 1) { h.idx++; applySnap(h.stack[h.idx]) }
      }
    }
    // capture aşaması: PCB/şema editörlerinin window dinleyicilerinden önce yakala
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog])

  const loadFootprint = (fp: Footprint, asCopy: boolean) => {
    histRef.current = { stack: [], idx: -1, muted: false }
    setEditingId(asCopy ? null : fp.id)
    setName(asCopy ? `${fp.name} (${t('özel')})` : fp.name)
    setCategory(fp.category)
    setDescription(fp.description)
    setBodyW(fp.body.width)
    setBodyH(fp.body.height)
    setPads(structuredClone(fp.pads))
    setBodyOutline(fp.outline ? structuredClone(fp.outline) : null)
    setSilk(
      fp.outline
        ? stripOutlineLines(structuredClone(fp.silk), fp.outline)
        : structuredClone(fp.silk)
    )
    setSymbolDef(fp.symbol ? structuredClone(fp.symbol) : null)
    setModel3d(fp.model3d ? structuredClone(fp.model3d) : null)
    setSourceNote(
      asCopy
        ? t('Yerleşik "{name}" kopyalanıyor — kaydedince Özel kategorisine eklenir', { name: fp.name })
        : ''
    )
    setBaselineTick((v) => v + 1)
  }

  // Dışarıdan hedefle açıldıysa yükle (builtin → kopya, custom → yerinde düzenle)
  useEffect(() => {
    if (activeDialog === 'footprint-editor' && target) {
      const fp = getFootprint(target)
      if (fp) loadFootprint(fp, !fp.custom)
      useStore.setState({ footprintEditorTarget: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialog, target, getFootprint])

  if (activeDialog !== 'footprint-editor') return null

  const resetForm = () => {
    histRef.current = { stack: [], idx: -1, muted: false }
    setEditingId(null)
    setName('')
    setCategory('Genel')
    setDescription('')
    setSavedFlash(false)
    setBodyW(10)
    setBodyH(10)
    setPads([emptyPad(1), emptyPad(2)])
    setBodyOutline(null)
    setSilk([])
    setSymbolDef(null)
    setModel3d(null)
    setSourceNote('')
    setTab('pcb')
    setBaselineTick((v) => v + 1)
  }

  const updatePad = (i: number, patch: Partial<PadDef>) => {
    setPads((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  const generateGrid = () => {
    const newPads: PadDef[] = []
    let n = 1
    const startX = -((genCols - 1) * genPitch) / 2
    const rowY =
      genRows === 1
        ? [0]
        : Array.from(
            { length: genRows },
            (_, r) => -((genRows - 1) * genRowSpacing) / 2 + r * genRowSpacing
          )
    for (const y of rowY) {
      for (let c = 0; c < genCols; c++) {
        newPads.push({ ...emptyPad(n), x: +(startX + c * genPitch).toFixed(3), y })
        n++
      }
    }
    setPads(newPads)
    setBodyW(Math.max(6, genCols * genPitch + 2))
    setBodyH(Math.max(6, (genRows - 1) * genRowSpacing + 4))
    setSilk([])
    setBodyOutline(null)
  }

  /** Footprint'i kaydeder; kayıt gerçekleşirse true döner (validasyon başarısızsa false) */
  const save = (): boolean => {
    if (pads.length === 0) {
      setStatus(t('En az bir pad gerekli'))
      return false
    }
    const hasOutline = !!bodyOutline && bodyOutline.length >= 2
    // Silkscreen: dış hat çizgileri (varsa) + kullanıcının çizdiği öğeler;
    // hiçbiri yoksa gövde ölçülerinden dikdörtgen çerçeve.
    const finalSilk: SilkElement[] = hasOutline
      ? [...outlineLines(bodyOutline!), ...silk]
      : silk.length > 0
        ? silk
        : [
            { kind: 'line', x1: -bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: -bodyH / 2, width: 0.2 },
            { kind: 'line', x1: bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: bodyH / 2, width: 0.2 },
            { kind: 'line', x1: bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: bodyH / 2, width: 0.2 },
            { kind: 'line', x1: -bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: -bodyH / 2, width: 0.2 }
          ]
    // Gövde sınır kutusu: dış hat varsa ondan hesapla
    const body = hasOutline
      ? (() => {
          const xs = bodyOutline!.map((p) => p.x)
          const ys = bodyOutline!.map((p) => p.y)
          const minX = Math.min(...xs), minY = Math.min(...ys)
          return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
        })()
      : { x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH }
    // Özel sembol: pinleri pad listesiyle eşitle
    const sym = symbolDef ? reconcileSymbolPins(symbolDef, pads) : null
    const fp: Footprint = {
      id: editingId ?? uid('fp-'),
      name: name.trim() || t('İsimsiz'),
      description: description.trim() || `${pads.length} pad`,
      category,
      pads: pads.map((p) => ({
        ...p,
        ...(p.layer === 'both' ? {} : { drill: undefined })
      })),
      silk: finalSilk,
      ...(hasOutline ? { outline: bodyOutline! } : {}),
      ...(sym && sym.pins.length > 0 ? { symbol: sym } : {}),
      ...(model3d ? { model3d } : {}),
      body,
      custom: true
    }
    // Kullanıcı kütüphanesine kaydet (otomatik kalıcı — "Kaydet" gerektirmez)
    saveFootprint(fp)
    // Bu footprint mevcut projede kullanılıyorsa (kartta yerleşik/gömülüyse),
    // projedeki gömülü kopyayı da güncelle — aksi halde kart/3B görünüm eski
    // hâliyle kalır (kullanılan footprint güncellenemiyor bug'ı).
    const proj = useStore.getState().project
    const inUseInProject =
      proj.customFootprints.some((f) => f.id === fp.id) ||
      proj.components.some((c) => c.footprintId === fp.id)
    let warn: { removed: number; prunedNets: number } | null = null
    if (inUseInProject) {
      warn = useStore.getState().addCustomFootprint(fp)
    }
    // Düzenlemeye devam et — yeni boş karta atlama (bireysel düzenleme)
    setEditingId(fp.id)
    setSymbolDef(sym)
    setSourceNote('')
    setSavedFlash(true)
    setBaselineTick((v) => v + 1)
    setTimeout(() => setSavedFlash(false), 1600)
    if (warn && warn.removed > 0) {
      setStatus(
        t(
          '"{name}" güncellendi — DİKKAT: {n} komponent yeni pad düzenine uymadığı için karttan kaldırıldı',
          { name: fp.name, n: warn.removed }
        )
      )
    } else if (warn && warn.prunedNets > 0) {
      setStatus(
        t('"{name}" güncellendi — karttaki {n} eski pad net ataması temizlendi', {
          name: fp.name,
          n: warn.prunedNets
        })
      )
    } else {
      setStatus(
        t('"{name}" kütüphaneye kaydedildi (otomatik) — {cat} kategorisi', {
          name: fp.name,
          cat: t(category)
        })
      )
    }
    return true
  }

  /** X ile kapatma: kaydedilmemiş değişiklik varsa önce sorar */
  const requestClose = () => {
    if (isDirty) {
      setCloseConfirm(true)
      return
    }
    openDialog(null)
  }

  return (
    <>
    <div className="modal-backdrop">
      <div
        className={'modal footprint-modal' + (maximized ? ' is-full' : '')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            <Icon name="chip" size={16} /> {t('Footprint Editörü')}{' '}
            {editingId ? (
              <small>({t('düzenleniyor')}: {name || t('İsimsiz')})</small>
            ) : (
              <small>({t('yeni')})</small>
            )}
            {savedFlash && <span className="saved-flash"><Icon name="check" size={13} /> {t('Kaydedildi')}</span>}
          </h3>
          <div className="modal-header-actions">
            <button
              className={maximized ? 'active' : ''}
              title={maximized ? t('Pencereyi küçült') : t('Tam ekran (çizim alanını büyüt)')}
              onClick={() => setMaximized((v) => !v)}
            >
              <Icon name={maximized ? 'fullscreenExit' : 'fullscreen'} size={15} />
            </button>
            <button onClick={requestClose} title={t('Kapat')}><Icon name="close" size={14} /></button>
          </div>
        </div>

        {sourceNote && <div className="source-note">ℹ {sourceNote}</div>}

        <div className="footprint-layout">
          <div className="footprint-form">
            <div className="field">
              <label>{t('Ad')}</label>
              <input
                value={name}
                placeholder={t('Yeni Komponent')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t('Kategori')} <small>({t('kullanıcı kütüphanesi')})</small></label>
              {addingCat ? (
                <div className="field-row" style={{ gap: 4 }}>
                  <input
                    autoFocus
                    value={newCatName}
                    placeholder={t('Kategori adı')}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = newCatName.trim()
                        if (n) { addCategory(n); setCategory(n) }
                        setAddingCat(false); setNewCatName('')
                      } else if (e.key === 'Escape') {
                        setAddingCat(false); setNewCatName('')
                      }
                      e.stopPropagation()
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = newCatName.trim()
                      if (n) { addCategory(n); setCategory(n) }
                      setAddingCat(false); setNewCatName('')
                    }}
                  ><Icon name="check" size={13} /></button>
                  <button type="button" onClick={() => { setAddingCat(false); setNewCatName('') }}><Icon name="close" size={13} /></button>
                </div>
              ) : (
                <div className="field-row" style={{ gap: 4 }}>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {categories.map((c) => (
                      <option key={c} value={c}>{t(c)}</option>
                    ))}
                    {!categories.includes(category) && (
                      <option value={category}>{t(category)}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    title={t('Yeni kategori oluştur')}
                    onClick={() => setAddingCat(true)}
                  ><Icon name="plus" size={13} /></button>
                  <button
                    type="button"
                    className="btn-secondary btn-danger-outline"
                    title={t('Bu kategoriyi sil (içindekiler Genel\'e taşınır)')}
                    disabled={category === 'Genel'}
                    onClick={() => askDeleteCategory(category)}
                  ><Icon name="trash" size={13} /></button>
                </div>
              )}
            </div>
            <div className="field">
              <label>{t('Açıklama')}</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('Ölçüler, notlar...')}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>{t('Gövde G (mm)')}</label>
                <input type="number" step={0.5} value={bodyW} onChange={(e) => setBodyW(parseFloat(e.target.value) || 1)} />
              </div>
              <div className="field">
                <label>{t('Gövde Y (mm)')}</label>
                <input type="number" step={0.5} value={bodyH} onChange={(e) => setBodyH(parseFloat(e.target.value) || 1)} />
              </div>
            </div>

            <div className="generator-box">
              <h4><Icon name="net" size={13} /> {t('Hızlı pad üreteci')}</h4>
              <div className="field-row">
                <div className="field">
                  <label>{t('Sıra')}</label>
                  <input type="number" min={1} max={4} value={genRows} onChange={(e) => setGenRows(Math.min(4, Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="field">
                  <label>{t('Sütun')}</label>
                  <input type="number" min={1} max={40} value={genCols} onChange={(e) => setGenCols(Math.min(40, Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="field">
                  <label>{t('Pitch')}</label>
                  <input type="number" step={0.01} value={genPitch} onChange={(e) => setGenPitch(parseFloat(e.target.value) || 2.54)} />
                </div>
                <div className="field">
                  <label>{t('Sıra aralığı')}</label>
                  <input type="number" step={0.01} value={genRowSpacing} onChange={(e) => setGenRowSpacing(parseFloat(e.target.value) || 7.62)} />
                </div>
              </div>
              <button onClick={generateGrid}>
                {t('Izgara Üret')} ({genRows}×{genCols})
              </button>
            </div>

            <h4>{t('Pad\'ler')} ({pads.length})</h4>
            <div className="pad-table">
              <div className="pad-table-header">
                <span>{t('Ad')}</span><span>X</span><span>Y</span><span>{t('Şekil')}</span>
                <span>G</span><span>Y</span><span>{t('Delik')}</span><span>{t('Katman')}</span><span></span>
              </div>
              {pads.map((pad, i) => (
                <div key={i} className="pad-table-row">
                  <input value={pad.name} onChange={(e) => updatePad(i, { name: e.target.value })} />
                  <input type="number" step={0.127} value={pad.x} onChange={(e) => updatePad(i, { x: parseFloat(e.target.value) || 0 })} />
                  <input type="number" step={0.127} value={pad.y} onChange={(e) => updatePad(i, { y: parseFloat(e.target.value) || 0 })} />
                  <select value={pad.shape} onChange={(e) => updatePad(i, { shape: e.target.value as PadDef['shape'] })}>
                    <option value="circle">{t('Daire')}</option>
                    <option value="rect">{t('Kare')}</option>
                    <option value="oval">{t('Oval')}</option>
                  </select>
                  <input type="number" step={0.1} value={pad.width} onChange={(e) => updatePad(i, { width: parseFloat(e.target.value) || 0.5 })} />
                  <input type="number" step={0.1} value={pad.height} onChange={(e) => updatePad(i, { height: parseFloat(e.target.value) || 0.5 })} />
                  <input
                    type="number"
                    step={0.1}
                    value={pad.drill ?? 0}
                    disabled={pad.layer !== 'both'}
                    onChange={(e) => updatePad(i, { drill: parseFloat(e.target.value) || undefined })}
                  />
                  <select
                    value={pad.layer}
                    onChange={(e) => {
                      const layer = e.target.value as PadDef['layer']
                      updatePad(i, {
                        layer,
                        drill: layer === 'both' ? (pad.drill || 0.9) : undefined
                      })
                    }}
                  >
                    <option value="both">{t('Delikli')}</option>
                    <option value="top">{t('SMD üst')}</option>
                    <option value="bottom">{t('SMD alt')}</option>
                  </select>
                  <button
                    className="pad-remove"
                    onClick={() => setPads((ps) => ps.filter((_, j) => j !== i))}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setPads((ps) => [...ps, emptyPad(ps.length + 1)])}>
              <Icon name="plus" size={13} /> {t('Pad Ekle')}
            </button>

            <div className="modal-buttons">
              <button className="btn-secondary" onClick={resetForm} title={t('Yeni boş footprint\'e geç')}>
                <Icon name="plus" size={13} /> {t('Yeni (boş)')}
              </button>
              <button className="btn-primary" onClick={save}>
                <Icon name="save" size={14} /> {editingId ? t('Güncelle') : t('Kütüphaneye Kaydet')}
              </button>
            </div>
            <p className="calc-note">
              {t('Değişiklikler otomatik kaydedilir ve PC\'de/tarayıcıda kalıcıdır. Kaydedince bu footprint\'i düzenlemeye devam edersiniz.')}
            </p>
          </div>

          <div className="footprint-side">
            <div className="fp-tabs">
              <button className={tab === 'pcb' ? 'active' : ''} onClick={() => setTab('pcb')}>
                <Icon name="chip" size={14} /> {t('Kılıf (PCB)')}
              </button>
              <button className={tab === 'symbol' ? 'active' : ''} onClick={() => setTab('symbol')}>
                <Icon name="schematic" size={14} /> {t('Şema Sembolü')} {symbolDef ? '●' : ''}
              </button>
              <button className={tab === 'model3d' ? 'active' : ''} onClick={() => setTab('model3d')}>
                <Icon name="cube" size={14} /> {t('3B Model')} {model3d ? '●' : ''}
              </button>
            </div>

            {tab === 'pcb' && (
              <FpCanvas
                pads={pads}
                setPads={setPads}
                bodyW={bodyW}
                bodyH={bodyH}
                silk={silk}
                setSilk={setSilk}
                bodyOutline={bodyOutline}
                setBodyOutline={setBodyOutline}
                canvasW={fpCanvasW}
                canvasH={fpCanvasH}
              />
            )}
            {tab === 'symbol' && (
              <SymbolCanvas
                pads={pads}
                bodyW={bodyW}
                bodyH={bodyH}
                fpName={name}
                symbolDef={symbolDef}
                setSymbolDef={setSymbolDef}
              />
            )}
            {tab === 'model3d' && (
              <Model3DTab
                pads={pads}
                bodyW={bodyW}
                bodyH={bodyH}
                fpName={name}
                model3d={model3d}
                setModel3d={setModel3d}
              />
            )}

            <div className="edit-existing">
              <h4>{t('Var olanı düzenle')}</h4>
              <select
                defaultValue=""
                onChange={(e) => {
                  const fp = getFootprint(e.target.value)
                  if (fp) loadFootprint(fp, !fp.custom)
                  e.target.value = ''
                }}
              >
                <option value="" disabled>
                  {t('Hazır footprint seç (kopyalanır)...')}
                </option>
                {useStore.getState().allFootprints().map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.custom ? '★ ' : ''}{f.name}
                  </option>
                ))}
              </select>
            </div>
            {customFootprints.length > 0 && (
              <div className="custom-list">
                <h4>{t('Kullanıcı kütüphanem')} ({customFootprints.length})</h4>
                {categories
                  .map((cat) => ({ cat, items: customFootprints.filter((f) => (f.category || 'Genel') === cat) }))
                  .filter((g) => g.items.length > 0)
                  .map(({ cat, items }) => (
                    <div key={cat} className="custom-cat-group">
                      <div className="custom-cat-header">{t(cat)} <span>{items.length}</span></div>
                      {items.map((fp) => (
                        <div
                          key={fp.id}
                          className={'custom-item' + (editingId === fp.id ? ' editing' : '')}
                        >
                          <span className="custom-item-name" title={fp.description}>{fp.name}</span>
                          <span>
                            <select
                              className="cat-move"
                              value={fp.category || 'Genel'}
                              title={t('Kategoriye taşı')}
                              onChange={(e) => useUserLibrary.getState().moveToCategory(fp.id, e.target.value)}
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{t(c)}</option>
                              ))}
                            </select>
                            <button onClick={() => loadFootprint(fp, false)} title={t('Düzenle')}><Icon name="edit" size={12} /></button>
                            <button onClick={() => removeFootprint(fp.id)} title={t('Sil')}><Icon name="trash" size={12} /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    {closeConfirm && (
      <div className="modal-backdrop fp-close-confirm-backdrop" onMouseDown={() => setCloseConfirm(false)}>
        <div className="modal prompt-modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
          <h3>{t('Kaydedilmemiş değişiklikler var')}</h3>
          <p className="confirm-message">
            {t('Bu footprint\'te kaydedilmemiş değişiklikler var. Kapatmadan önce kaydetmek ister misiniz?')}
          </p>
          <div className="modal-buttons">
            <button className="btn-secondary" onClick={() => setCloseConfirm(false)}>
              {t('İptal')}
            </button>
            <button
              className="btn-secondary btn-danger-outline"
              onClick={() => { setCloseConfirm(false); openDialog(null) }}
            >
              {t('Kaydetmeden Kapat')}
            </button>
            <button
              className="btn-primary"
              onClick={() => { if (save()) { setCloseConfirm(false); openDialog(null) } }}
            >
              {t('Kaydet ve Kapat')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

/** Pad adı etiketinin varsayılan (yerel) konumu — pad'in YANINDA, footprint
 *  merkezine doğru (silk pin gösterimiyle birebir aynı: etiketi sürükleyerek
 *  silk pin konumu ayarlanır). Merkez footprint origini (0,0) varsayılır. */
function defaultLabelPos(pad: PadDef): Point {
  const copperPad = {
    ...pad,
    x: pad.x + (pad.holeDx ?? 0),
    y: pad.y + (pad.holeDy ?? 0),
    nameDx: undefined,
    nameDy: undefined
  }
  const pl = pinLabelPlacement(copperPad, 0, 0)
  return { x: pl.x, y: pl.y }
}
/** Pad adı etiketinin geçerli (yerel) konumu — kayma uygulanmış */
function labelPos(pad: PadDef): Point {
  const d = defaultLabelPos(pad)
  const copperX = pad.x + (pad.holeDx ?? 0)
  const copperY = pad.y + (pad.holeDy ?? 0)
  return { x: copperX + (pad.nameDx ?? (d.x - copperX)), y: copperY + (pad.nameDy ?? (d.y - copperY)) }
}

type FpTool = 'move' | 'pad' | 'outline' | 'line' | 'circle' | 'arc' | 'text' | 'delete'

/**
 * Kılıf (PCB) tuvali — kart editörü benzeri: pan/zoom, ızgara, pad taşıma/ekleme,
 * silkscreen çizgi/daire/yazı çizimi, gövde dış hattı, silme. (issue: footprint
 * editöründe detaylı çizim)
 */
function FpCanvas({
  pads,
  setPads,
  bodyW,
  bodyH,
  silk,
  setSilk,
  bodyOutline,
  setBodyOutline,
  canvasW = 500,
  canvasH = 400
}: {
  pads: PadDef[]
  setPads: (updater: (ps: PadDef[]) => PadDef[]) => void
  bodyW: number
  bodyH: number
  silk: SilkElement[]
  setSilk: (updater: (s: SilkElement[]) => SilkElement[]) => void
  bodyOutline: Point[] | null
  setBodyOutline: (o: Point[] | null) => void
  /** Tuval boyutu (px) — tam ekran modunda büyütülür */
  canvasW?: number
  canvasH?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = useT()
  const ask = usePrompt((s) => s.ask)
  const W = canvasW
  const H = canvasH
  const GRID = 0.635
  const [tool, setTool] = useState<FpTool>('move')
  const [snap, setSnap] = useState(true)
  const [draft, setDraft] = useState<Point[] | null>(null)
  const [shapeDraft, setShapeDraft] = useState<{ a: Point; b: Point } | null>(null)
  // Yay çizim taslağı: merkez → yarıçap/başlangıç açısı → bitiş açısı (3 tık)
  const [arcDraft, setArcDraft] = useState<
    { cx: number; cy: number; r: number | null; a0: number | null; cursor: Point } | null
  >(null)
  const [hover, setHover] = useState<Point | null>(null)
  // Seçili öğe (taşı aracında tıklayınca) — Del ile silinir, altta düzenlenir
  const [sel, setSel] = useState<{ kind: 'pad' | 'silk' | 'vertex'; index: number } | null>(null)
  // null → içeriğe otomatik sığdır; kullanıcı zoom/pan yapınca sabitlenir
  const [zoom, setZoomState] = useState<{ scale: number; x: number; y: number } | null>(null)
  const dragRef = useRef<
    | { kind: 'pad' | 'label' | 'vertex'; index: number }
    | { kind: 'silk'; index: number; start: Point; orig: SilkElement }
    | { kind: 'pan' }
    | null
  >(null)
  const shiftRef = useRef(false)

  // ── Klavye: Del = seçiliyi sil, Esc = iptal/temizle ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return
      if (e.key === 'Escape') {
        setDraft(null)
        setHover(null)
        setShapeDraft(null)
        setArcDraft(null)
        setSel(null)
        setTool('move')
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        if (sel.kind === 'pad') setPads((ps) => ps.filter((_, j) => j !== sel.index))
        else if (sel.kind === 'silk') setSilk((sl) => sl.filter((_, j) => j !== sel.index))
        else if (sel.kind === 'vertex' && bodyOutline) {
          if (bodyOutline.length <= 3) setBodyOutline(null)
          else setBodyOutline(bodyOutline.filter((_, j) => j !== sel.index))
        }
        setSel(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, bodyOutline, setPads, setSilk, setBodyOutline])

  const extent = useMemo(() => {
    let maxX = bodyW / 2
    let maxY = bodyH / 2
    const consider = (x: number, y: number) => {
      maxX = Math.max(maxX, Math.abs(x))
      maxY = Math.max(maxY, Math.abs(y))
    }
    for (const p of pads) {
      const copperX = p.x + (p.holeDx ?? 0)
      const copperY = p.y + (p.holeDy ?? 0)
      consider(Math.abs(copperX) + p.width / 2, Math.abs(copperY) + p.height / 2)
      const lp = labelPos(p)
      consider(lp.x, lp.y)
    }
    for (const p of bodyOutline ?? []) consider(p.x, p.y)
    for (const p of draft ?? []) consider(p.x, p.y)
    for (const e of silk) {
      if (e.kind === 'line') { consider(e.x1, e.y1); consider(e.x2, e.y2) }
      else if (e.kind === 'circle' || e.kind === 'arc') { consider(e.cx + e.r, e.cy + e.r); consider(e.cx - e.r, e.cy - e.r) }
      else consider(e.x, e.y)
    }
    return { maxX: maxX + 2, maxY: maxY + 2 }
  }, [pads, bodyW, bodyH, bodyOutline, draft, silk])

  const autoScale = Math.min(W / (extent.maxX * 2), H / (extent.maxY * 2))
  const vw = zoom ?? { scale: autoScale, x: 0, y: 0 }
  const toLocal = (sx: number, sy: number): Point => ({
    x: (sx - W / 2 - vw.x) / vw.scale,
    y: (sy - H / 2 - vw.y) / vw.scale
  })
  const snapLocal = (p: Point): Point =>
    snap && !shiftRef.current
      ? { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
      : { x: +p.x.toFixed(3), y: +p.y.toFixed(3) }

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = toLocal(sx, sy)
    const factor = Math.exp(-e.deltaY * 0.0014)
    const scale = Math.min(400, Math.max(2, vw.scale * factor))
    // imleç altındaki dünya noktası sabit kalsın
    setZoomState({
      scale,
      x: sx - W / 2 - world.x * scale,
      y: sy - H / 2 - world.y * scale
    })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#14171c'
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2 + vw.x, H / 2 + vw.y)
    ctx.scale(vw.scale, vw.scale)

    // Görünür dünya aralığı
    const tl = toLocal(0, 0)
    const br = toLocal(W, H)

    // Izgara — piksel aralığı ~>=7 px olacak biçimde uyarlanır
    const minorPx = GRID * vw.scale
    const k = minorPx >= 7 ? 1 : Math.ceil(7 / minorPx)
    const step = GRID * k
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1 / vw.scale
    ctx.beginPath()
    for (let gx = Math.floor(tl.x / step) * step; gx <= br.x; gx += step) {
      ctx.moveTo(gx, tl.y)
      ctx.lineTo(gx, br.y)
    }
    for (let gy = Math.floor(tl.y / step) * step; gy <= br.y; gy += step) {
      ctx.moveTo(tl.x, gy)
      ctx.lineTo(br.x, gy)
    }
    ctx.stroke()
    // Ana ızgara (2.54)
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.beginPath()
    const major = 2.54
    for (let gx = Math.floor(tl.x / major) * major; gx <= br.x; gx += major) {
      ctx.moveTo(gx, tl.y)
      ctx.lineTo(gx, br.y)
    }
    for (let gy = Math.floor(tl.y / major) * major; gy <= br.y; gy += major) {
      ctx.moveTo(tl.x, gy)
      ctx.lineTo(br.x, gy)
    }
    ctx.stroke()

    // Merkez ekseni
    ctx.strokeStyle = 'rgba(143,214,255,0.3)'
    ctx.lineWidth = 1.2 / vw.scale
    ctx.beginPath(); ctx.moveTo(tl.x, 0); ctx.lineTo(br.x, 0)
    ctx.moveTo(0, tl.y); ctx.lineTo(0, br.y); ctx.stroke()

    // Gövde: elle dış hat varsa onu, yoksa dikdörtgen
    ctx.strokeStyle = '#e8e8e8'
    ctx.lineWidth = 0.2
    ctx.lineJoin = 'round'
    if (bodyOutline && bodyOutline.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(bodyOutline[0].x, bodyOutline[0].y)
      for (const p of bodyOutline.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.closePath(); ctx.stroke()
      ctx.fillStyle = '#8fd6ff'
      const r = 3.5 / vw.scale
      for (const p of bodyOutline) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill() }
    } else {
      ctx.setLineDash([0.6, 0.4])
      ctx.strokeStyle = 'rgba(232,232,232,0.55)'
      ctx.strokeRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH)
      ctx.setLineDash([])
    }

    // Kullanıcı silkscreen öğeleri
    ctx.strokeStyle = '#e8e8e8'
    ctx.fillStyle = '#e8e8e8'
    for (const e of silk) {
      if (e.kind === 'line') {
        ctx.lineWidth = Math.max(e.width, 1.2 / vw.scale)
        ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke()
      } else if (e.kind === 'circle') {
        ctx.lineWidth = Math.max(e.width, 1.2 / vw.scale)
        ctx.beginPath(); ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2); ctx.stroke()
      } else if (e.kind === 'arc') {
        ctx.lineWidth = Math.max(e.width, 1.2 / vw.scale)
        ctx.beginPath(); ctx.arc(e.cx, e.cy, e.r, e.a0, e.a1); ctx.stroke()
      } else {
        ctx.font = `${e.size}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(e.text, e.x, e.y)
      }
    }

    // Çizilmekte olan dış hat taslağı
    if (draft && draft.length > 0) {
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = 1.5 / vw.scale
      ctx.beginPath()
      ctx.moveTo(draft[0].x, draft[0].y)
      for (const p of draft.slice(1)) ctx.lineTo(p.x, p.y)
      if (hover) ctx.lineTo(hover.x, hover.y)
      ctx.stroke()
      ctx.fillStyle = '#ffd166'
      const r = 3 / vw.scale
      for (const p of draft) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill() }
    }

    // Çizgi/daire taslağı
    if (shapeDraft) {
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = 1.5 / vw.scale
      ctx.beginPath()
      if (tool === 'line') {
        ctx.moveTo(shapeDraft.a.x, shapeDraft.a.y)
        ctx.lineTo(shapeDraft.b.x, shapeDraft.b.y)
      } else {
        const r = Math.hypot(shapeDraft.b.x - shapeDraft.a.x, shapeDraft.b.y - shapeDraft.a.y)
        ctx.arc(shapeDraft.a.x, shapeDraft.a.y, Math.max(r, 0.01), 0, Math.PI * 2)
      }
      ctx.stroke()
    }

    // Yay taslağı (3 tıklık akış: merkez → yarıçap/başlangıç → bitiş)
    if (arcDraft) {
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = 1.2 / vw.scale
      const m = 4 / vw.scale
      ctx.beginPath()
      ctx.moveTo(arcDraft.cx - m, arcDraft.cy)
      ctx.lineTo(arcDraft.cx + m, arcDraft.cy)
      ctx.moveTo(arcDraft.cx, arcDraft.cy - m)
      ctx.lineTo(arcDraft.cx, arcDraft.cy + m)
      ctx.stroke()
      if (arcDraft.r === null) {
        const liveR = Math.hypot(arcDraft.cursor.x - arcDraft.cx, arcDraft.cursor.y - arcDraft.cy)
        ctx.setLineDash([3 / vw.scale, 3 / vw.scale])
        ctx.beginPath(); ctx.arc(arcDraft.cx, arcDraft.cy, liveR, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      } else {
        const curA = Math.atan2(arcDraft.cursor.y - arcDraft.cy, arcDraft.cursor.x - arcDraft.cx)
        ctx.setLineDash([3 / vw.scale, 3 / vw.scale])
        ctx.beginPath(); ctx.arc(arcDraft.cx, arcDraft.cy, arcDraft.r, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        if (arcDraft.a0 !== null) {
          ctx.lineWidth = 2 / vw.scale
          ctx.beginPath(); ctx.arc(arcDraft.cx, arcDraft.cy, arcDraft.r, arcDraft.a0, curA); ctx.stroke()
        }
      }
    }

    // Pad'ler
    for (const pad of pads) {
      const px = pad.x + (pad.holeDx ?? 0)
      const py = pad.y + (pad.holeDy ?? 0)
      ctx.fillStyle =
        pad.layer === 'both' ? '#d4af37' : pad.layer === 'top' ? '#d94f3d' : '#4a7fdb'
      if (pad.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(px, py, Math.max(pad.width, pad.height) / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (pad.shape === 'oval') {
        const r = Math.min(pad.width, pad.height) / 2
        const x = px - pad.width / 2
        const y = py - pad.height / 2
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + pad.width, y, x + pad.width, y + pad.height, r)
        ctx.arcTo(x + pad.width, y + pad.height, x, y + pad.height, r)
        ctx.arcTo(x, y + pad.height, x, y, r)
        ctx.arcTo(x, y, x + pad.width, y, r)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(px - pad.width / 2, py - pad.height / 2, pad.width, pad.height)
      }
      if (pad.layer === 'both' && pad.drill) {
        // Siyah delik pad'in ana X/Y konumunda sabittir; sarı pad yukarıda
        // holeDx/holeDy ile ayrı çizilir.
        ctx.fillStyle = '#0e1116'
        ctx.beginPath()
        ctx.arc(pad.x, pad.y, pad.drill / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      // Pad adı — pad yanında (silk pin gösterimiyle aynı yerleşim); elle
      // taşınmışsa bağlantı çizgisiyle
      const place = pinLabelPlacement({ ...pad, x: px, y: py }, 0, 0)
      const moved = pad.nameDx !== undefined || pad.nameDy !== undefined
      if (moved && Math.hypot(place.x - px, place.y - py) > Math.max(pad.width, pad.height) / 2 + 0.3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 0.05
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(place.x, place.y); ctx.stroke()
      }
      const lp = place
      ctx.fillStyle = '#fff'
      ctx.font = `${Math.max(1, 11 / vw.scale)}px sans-serif`
      ctx.textAlign = place.align === 'left' ? 'left' : 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pad.name, lp.x, lp.y)
    }

    // Seçim vurgusu (cyan)
    if (sel) {
      ctx.strokeStyle = '#3fd3dc'
      ctx.lineWidth = 1.6 / vw.scale
      ctx.setLineDash([4 / vw.scale, 3 / vw.scale])
      if (sel.kind === 'pad' && pads[sel.index]) {
        const p = pads[sel.index]
        const r = Math.max(p.width, p.height) / 2 + 0.5
        ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2)
      } else if (sel.kind === 'vertex' && bodyOutline?.[sel.index]) {
        const p = bodyOutline[sel.index]
        ctx.beginPath()
        ctx.arc(p.x, p.y, 6 / vw.scale, 0, Math.PI * 2)
        ctx.stroke()
      } else if (sel.kind === 'silk' && silk[sel.index]) {
        const e = silk[sel.index]
        if (e.kind === 'line') {
          ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke()
        } else if (e.kind === 'circle') {
          ctx.beginPath(); ctx.arc(e.cx, e.cy, e.r + 0.3, 0, Math.PI * 2); ctx.stroke()
        } else if (e.kind === 'arc') {
          ctx.beginPath(); ctx.arc(e.cx, e.cy, e.r + 0.3, e.a0, e.a1); ctx.stroke()
        } else {
          const w = Math.max(1, e.text.length * e.size * 0.35)
          ctx.strokeRect(e.x - w, e.y - e.size, w * 2, e.size * 2)
        }
      }
      ctx.setLineDash([])
    }
    ctx.restore()

    // Bilgi şeridi
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(
      `${(extent.maxX * 2).toFixed(1)} × ${(extent.maxY * 2).toFixed(1)} mm · ${vw.scale.toFixed(0)} px/mm`,
      8,
      H - 8
    )
  })

  const labelHalf = (pad: PadDef) => ({
    w: Math.max(0.9, pad.name.length * 0.35),
    h: 0.7
  })

  /** Silk öğesi isabet testi (yerel koordinat, tolerans piksel bazlı) */
  const hitSilk = (loc: Point): number => {
    const tol = 6 / vw.scale
    for (let i = silk.length - 1; i >= 0; i--) {
      const e = silk[i]
      if (e.kind === 'line') {
        if (segPointDist({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }, loc) <= tol + e.width) return i
      } else if (e.kind === 'circle') {
        const d = Math.hypot(loc.x - e.cx, loc.y - e.cy)
        if (Math.abs(d - e.r) <= tol + e.width) return i
      } else if (e.kind === 'arc') {
        const d = Math.hypot(loc.x - e.cx, loc.y - e.cy)
        if (Math.abs(d - e.r) <= tol + e.width) {
          const ang = Math.atan2(loc.y - e.cy, loc.x - e.cx)
          if (angleInArc(ang, e.a0, e.a1)) return i
        }
      } else {
        const w = Math.max(1, e.text.length * e.size * 0.32)
        if (Math.abs(loc.x - e.x) <= w && Math.abs(loc.y - e.y) <= e.size) return i
      }
    }
    return -1
  }

  const onDown = async (e: React.MouseEvent) => {
    shiftRef.current = e.shiftKey
    const rect = canvasRef.current!.getBoundingClientRect()
    const rawLoc = toLocal(e.clientX - rect.left, e.clientY - rect.top)
    // Orta/sağ tuş: pan
    if (e.button === 1 || e.button === 2) {
      dragRef.current = { kind: 'pan' }
      return
    }
    if (e.button !== 0) return
    const loc = rawLoc
    const sp = snapLocal(loc)

    switch (tool) {
      case 'outline': {
        setDraft((d) => (d ? [...d, sp] : [sp]))
        return
      }
      case 'pad': {
        setPads((ps) => [...ps, { ...emptyPad(ps.length + 1), x: sp.x, y: sp.y }])
        return
      }
      case 'line':
      case 'circle': {
        setShapeDraft({ a: sp, b: sp })
        return
      }
      case 'arc': {
        if (!arcDraft) {
          setArcDraft({ cx: sp.x, cy: sp.y, r: null, a0: null, cursor: sp })
        } else if (arcDraft.r === null) {
          const r = Math.hypot(loc.x - arcDraft.cx, loc.y - arcDraft.cy)
          if (r < 0.3) return
          const a0 = Math.atan2(loc.y - arcDraft.cy, loc.x - arcDraft.cx)
          setArcDraft({ ...arcDraft, r, a0, cursor: loc })
        } else if (arcDraft.a0 !== null) {
          const a0 = arcDraft.a0
          const r = arcDraft.r
          const a1 = Math.atan2(loc.y - arcDraft.cy, loc.x - arcDraft.cx)
          setSilk((s) => [
            ...s,
            { kind: 'arc', cx: arcDraft.cx, cy: arcDraft.cy, r: +r.toFixed(3), a0, a1, width: 0.2 }
          ])
          setArcDraft(null)
        }
        return
      }
      case 'text': {
        const txt = await ask(t('Silkscreen yazısı'), '', t('Örn: 1, A, +'))
        if (txt && txt.trim()) {
          setSilk((s) => [...s, { kind: 'text', x: sp.x, y: sp.y, text: txt.trim(), size: 1 }])
        }
        return
      }
      case 'delete': {
        setSel(null)
        // önce pad, sonra silk, sonra dış hat köşesi
        for (let i = pads.length - 1; i >= 0; i--) {
          const pad = pads[i]
          const r = Math.max(pad.width, pad.height) / 2 + 0.3
          const copperX = pad.x + (pad.holeDx ?? 0)
          const copperY = pad.y + (pad.holeDy ?? 0)
          if (Math.hypot(loc.x - copperX, loc.y - copperY) <= r) {
            setPads((ps) => ps.filter((_, j) => j !== i))
            return
          }
        }
        const si = hitSilk(loc)
        if (si >= 0) {
          setSilk((s) => s.filter((_, j) => j !== si))
          return
        }
        if (bodyOutline) {
          const tol = 8 / vw.scale
          for (let i = 0; i < bodyOutline.length; i++) {
            if (Math.hypot(bodyOutline[i].x - loc.x, bodyOutline[i].y - loc.y) <= tol) {
              if (bodyOutline.length <= 3) setBodyOutline(null)
              else setBodyOutline(bodyOutline.filter((_, j) => j !== i))
              return
            }
          }
        }
        return
      }
      case 'move': {
        // önce etiket, sonra pad, sonra dış hat köşesi, sonra silk
        for (let i = pads.length - 1; i >= 0; i--) {
          const lp = labelPos(pads[i])
          const lh = labelHalf(pads[i])
          if (Math.abs(loc.x - lp.x) <= lh.w && Math.abs(loc.y - lp.y) <= lh.h) {
            setSel({ kind: 'pad', index: i })
            dragRef.current = { kind: 'label', index: i }
            return
          }
        }
        for (let i = pads.length - 1; i >= 0; i--) {
          const pad = pads[i]
          const r = Math.max(pad.width, pad.height) / 2 + 0.3
          const copperX = pad.x + (pad.holeDx ?? 0)
          const copperY = pad.y + (pad.holeDy ?? 0)
          if (Math.abs(loc.x - copperX) <= r && Math.abs(loc.y - copperY) <= r) {
            setSel({ kind: 'pad', index: i })
            dragRef.current = { kind: 'pad', index: i }
            return
          }
        }
        if (bodyOutline) {
          const tol = 8 / vw.scale
          for (let i = 0; i < bodyOutline.length; i++) {
            if (Math.hypot(bodyOutline[i].x - loc.x, bodyOutline[i].y - loc.y) <= tol) {
              setSel({ kind: 'vertex', index: i })
              dragRef.current = { kind: 'vertex', index: i }
              return
            }
          }
        }
        const si = hitSilk(loc)
        if (si >= 0) {
          setSel({ kind: 'silk', index: si })
          dragRef.current = { kind: 'silk', index: si, start: loc, orig: structuredClone(silk[si]) }
          return
        }
        // boşluk: pan
        setSel(null)
        dragRef.current = { kind: 'pan' }
        return
      }
    }
  }

  const onMove = (e: React.MouseEvent) => {
    shiftRef.current = e.shiftKey
    const rect = canvasRef.current!.getBoundingClientRect()
    const loc = toLocal(e.clientX - rect.left, e.clientY - rect.top)
    if (tool === 'outline' && draft) {
      setHover(snapLocal(loc))
      return
    }
    if (shapeDraft) {
      setShapeDraft({ a: shapeDraft.a, b: snapLocal(loc) })
      return
    }
    if (arcDraft) {
      setArcDraft({ ...arcDraft, cursor: loc })
      return
    }
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      setZoomState({ scale: vw.scale, x: vw.x + e.movementX, y: vw.y + e.movementY })
      return
    }
    const sp = snapLocal(loc)
    if (drag.kind === 'pad') {
      setPads((ps) => ps.map((p, j) => (j === drag.index ? { ...p, x: sp.x, y: sp.y } : p)))
    } else if (drag.kind === 'label') {
      setPads((ps) =>
        ps.map((p, j) =>
          j === drag.index ? { ...p, nameDx: +(sp.x - p.x).toFixed(3), nameDy: +(sp.y - p.y).toFixed(3) } : p
        )
      )
    } else if (drag.kind === 'vertex' && bodyOutline) {
      setBodyOutline(bodyOutline.map((p, j) => (j === drag.index ? sp : p)))
    } else if (drag.kind === 'silk') {
      const dx = loc.x - drag.start.x
      const dy = loc.y - drag.start.y
      const o = drag.orig
      setSilk((s) =>
        s.map((el, j) => {
          if (j !== drag.index) return el
          if (o.kind === 'line') {
            return { ...o, x1: +(o.x1 + dx).toFixed(3), y1: +(o.y1 + dy).toFixed(3), x2: +(o.x2 + dx).toFixed(3), y2: +(o.y2 + dy).toFixed(3) }
          }
          if (o.kind === 'circle' || o.kind === 'arc') {
            return { ...o, cx: +(o.cx + dx).toFixed(3), cy: +(o.cy + dy).toFixed(3) }
          }
          return { ...o, x: +(o.x + dx).toFixed(3), y: +(o.y + dy).toFixed(3) }
        })
      )
    }
  }

  const onUp = () => {
    if (shapeDraft) {
      const { a, b } = shapeDraft
      if (tool === 'line' && Math.hypot(b.x - a.x, b.y - a.y) >= 0.1) {
        setSilk((s) => [...s, { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: 0.2 }])
      } else if (tool === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y)
        if (r >= 0.2) setSilk((s) => [...s, { kind: 'circle', cx: a.x, cy: a.y, r: +r.toFixed(3), width: 0.2 }])
      }
      setShapeDraft(null)
    }
    dragRef.current = null
  }

  const finishOutline = () => {
    if (draft && draft.length >= 3) {
      setBodyOutline(draft)
      setDraft(null)
      setHover(null)
      setTool('move')
    }
  }

  const toolBtn = (id: FpTool, icon: ReactNode, label: string, title: string) => (
    <button
      type="button"
      className={tool === id ? 'active' : ''}
      onClick={() => {
        setTool(id)
        setShapeDraft(null)
        setArcDraft(null)
        if (id !== 'outline') { setDraft(null); setHover(null) }
        else setDraft([])
      }}
      title={title}
    >
      {icon} {label}
    </button>
  )

  return (
    <div>
      <div className="fp-canvas-tools">
        {toolBtn('move', <Icon name="move" size={14} />, t('Taşı'), t('Pad, etiket, silk ve köşeleri taşı — boşlukta sürükle: kaydır'))}
        {toolBtn('pad', <Icon name="via" size={14} />, t('Pad'), t('Tıklayarak pad ekle'))}
        {toolBtn('line', '╱', t('Çizgi'), t('Silkscreen çizgi çiz (sürükle)'))}
        {toolBtn('circle', '◯', t('Daire'), t('Silkscreen daire çiz (merkezden sürükle)'))}
        {toolBtn('arc', '◜', t('Yay'), t('Yay çiz — merkeze tıkla, yarıçap için tıkla, bitiş açısı için tıkla'))}
        {toolBtn('text', <Icon name="text" size={14} />, t('Yazı'), t('Silkscreen yazı ekle'))}
        {toolBtn('outline', <Icon name="pen" size={14} />, t('Dış hat'), t('Gövde dış hattını köşe köşe çiz — çift tık ile bitir'))}
        {toolBtn('delete', <Icon name="trash" size={14} />, t('Sil'), t('Pad / silk öğesi / köşe sil'))}
        {tool === 'outline' && (
          <button type="button" onClick={finishOutline} disabled={!draft || draft.length < 3}>
            <Icon name="check" size={13} /> {t('Bitir')}
          </button>
        )}
      </div>
      <div className="fp-canvas-tools">
        {bodyOutline && (
          <button type="button" className="btn-danger-outline" onClick={() => setBodyOutline(null)} title={t('Dikdörtgen gövdeye dön')}>
            <Icon name="trash" size={13} /> {t('Dış hattı sil')}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            setSilk((s) => [
              ...s,
              { kind: 'line', x1: -bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: -bodyH / 2, width: 0.2 },
              { kind: 'line', x1: bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: bodyH / 2, width: 0.2 },
              { kind: 'line', x1: bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: bodyH / 2, width: 0.2 },
              { kind: 'line', x1: -bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: -bodyH / 2, width: 0.2 }
            ])
          }
          title={t('Gövde ölçülerinden dikdörtgen çerçeve çiz')}
        >
          ▭ {t('Çerçeve')}
        </button>
        <button type="button" onClick={() => setZoomState(null)} title={t('İçeriğe sığdır')}>
          <Icon name="fullscreen" size={13} /> {t('Sığdır')}
        </button>
        <label className="fp-snap-toggle" title={t('Izgaraya yasla (Shift: serbest)')}>
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t('Izgaraya Yasla')}
        </label>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: W,
          height: H,
          cursor:
            tool === 'outline' || tool === 'line' || tool === 'circle' || tool === 'arc' || tool === 'pad'
              ? 'crosshair'
              : tool === 'delete'
                ? 'not-allowed'
                : 'default'
        }}
        className="footprint-preview"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onWheel={onWheel}
        onDoubleClick={finishOutline}
        onContextMenu={(e) => e.preventDefault()}
      />
      {sel && (() => {
        // Seçili öğe özellik çubuğu — sonradan konulan nesneler de düzenlenir
        if (sel.kind === 'pad' && pads[sel.index]) {
          const p = pads[sel.index]
          const up = (patch: Partial<PadDef>) =>
            setPads((ps) => ps.map((q, j) => (j === sel.index ? { ...q, ...patch } : q)))
          // Delik kayması sınırı: delik pad bakırının içinde kalmalı (en az
          // ince bir halka bırakarak) — kenar dışına taşma/kısa devre önlenir.
          const hasDrill = p.layer === 'both' && !!p.drill
          const maxHoleDx = Math.max(0, (p.width - (p.drill ?? 0)) / 2)
          const maxHoleDy = Math.max(0, (p.height - (p.drill ?? 0)) / 2)
          const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
          return (
            <div className="fp-props">
              <b>◉ {t('Pad')} {p.name}</b>
              <label>X<input type="number" step={0.127} value={p.x} onChange={(e) => up({ x: parseFloat(e.target.value) || 0 })} /></label>
              <label>Y<input type="number" step={0.127} value={p.y} onChange={(e) => up({ y: parseFloat(e.target.value) || 0 })} /></label>
              <label>G<input type="number" step={0.1} value={p.width} onChange={(e) => up({ width: parseFloat(e.target.value) || 0.5 })} /></label>
              <label>Y<input type="number" step={0.1} value={p.height} onChange={(e) => up({ height: parseFloat(e.target.value) || 0.5 })} /></label>
              {hasDrill && (
                <>
                  <span className="fp-props-sep" title={t('Sarı pad halkası konumu — siyah delik pad X/Y merkezinde sabittir')}>{t('Halka')}:</span>
                  <label title={t('Sarı pad halkasının X kayması (pad içinde)')}>◎X<input type="number" step={0.05} value={+(p.holeDx ?? 0).toFixed(3)} onChange={(e) => up({ holeDx: clamp(parseFloat(e.target.value) || 0, maxHoleDx) })} /></label>
                  <label title={t('Sarı pad halkasının Y kayması (pad içinde)')}>◎Y<input type="number" step={0.05} value={+(p.holeDy ?? 0).toFixed(3)} onChange={(e) => up({ holeDy: clamp(parseFloat(e.target.value) || 0, maxHoleDy) })} /></label>
                  {(p.holeDx || p.holeDy) ? (
                    <button type="button" className="fp-hole-reset" title={t('Sarı halkayı pad merkezine getir')} onClick={() => up({ holeDx: undefined, holeDy: undefined })}><Icon name="close" size={11} /></button>
                  ) : null}
                </>
              )}
            </div>
          )
        }
        if (sel.kind === 'vertex' && bodyOutline?.[sel.index]) {
          const p = bodyOutline[sel.index]
          const up = (patch: Partial<Point>) =>
            setBodyOutline(bodyOutline.map((q, j) => (j === sel.index ? { ...q, ...patch } : q)))
          return (
            <div className="fp-props">
              <b>▪ {t('Köşe')} #{sel.index + 1}</b>
              <label>X<input type="number" step={0.25} value={p.x} onChange={(e) => up({ x: parseFloat(e.target.value) || 0 })} /></label>
              <label>Y<input type="number" step={0.25} value={p.y} onChange={(e) => up({ y: parseFloat(e.target.value) || 0 })} /></label>
            </div>
          )
        }
        if (sel.kind === 'silk' && silk[sel.index]) {
          const e0 = silk[sel.index]
          const up = (el: SilkElement) =>
            setSilk((sl) => sl.map((q, j) => (j === sel.index ? el : q)))
          if (e0.kind === 'line') {
            return (
              <div className="fp-props">
                <b>╱ {t('Çizgi')}</b>
                <label>{t('Kalınlık')}<input type="number" step={0.05} min={0.05} value={e0.width} onChange={(e) => up({ ...e0, width: Math.max(0.05, parseFloat(e.target.value) || 0.2) })} /></label>
              </div>
            )
          }
          if (e0.kind === 'circle') {
            return (
              <div className="fp-props">
                <b>◯ {t('Daire')}</b>
                <label>R<input type="number" step={0.1} min={0.1} value={e0.r} onChange={(e) => up({ ...e0, r: Math.max(0.1, parseFloat(e.target.value) || 1) })} /></label>
                <label>{t('Kalınlık')}<input type="number" step={0.05} min={0.05} value={e0.width} onChange={(e) => up({ ...e0, width: Math.max(0.05, parseFloat(e.target.value) || 0.2) })} /></label>
              </div>
            )
          }
          if (e0.kind === 'arc') {
            const deg = (r: number) => Math.round((r * 180) / Math.PI)
            const rad = (d: number) => (d * Math.PI) / 180
            return (
              <div className="fp-props">
                <b>◜ {t('Yay')}</b>
                <label>R<input type="number" step={0.1} min={0.1} value={e0.r} onChange={(e) => up({ ...e0, r: Math.max(0.1, parseFloat(e.target.value) || 1) })} /></label>
                <label>{t('Başlangıç°')}<input type="number" step={5} value={deg(e0.a0)} onChange={(e) => up({ ...e0, a0: rad(parseFloat(e.target.value) || 0) })} /></label>
                <label>{t('Bitiş°')}<input type="number" step={5} value={deg(e0.a1)} onChange={(e) => up({ ...e0, a1: rad(parseFloat(e.target.value) || 0) })} /></label>
                <label>{t('Kalınlık')}<input type="number" step={0.05} min={0.05} value={e0.width} onChange={(e) => up({ ...e0, width: Math.max(0.05, parseFloat(e.target.value) || 0.2) })} /></label>
              </div>
            )
          }
          return (
            <div className="fp-props">
              <b>A {t('Yazı')}</b>
              <label>{t('Metin')}<input type="text" value={e0.text} onChange={(e) => up({ ...e0, text: e.target.value })} /></label>
              <label>{t('Boyut')}<input type="number" step={0.25} min={0.4} value={e0.size} onChange={(e) => up({ ...e0, size: Math.max(0.4, parseFloat(e.target.value) || 1) })} /></label>
            </div>
          )
        }
        return null
      })()}
      <div className="fp-canvas-hint">
        {tool === 'outline'
          ? t('Köşe eklemek için tıklayın · çift tık/Bitir ile kapatın')
          : t('Tekerlek: yakınlaştır · Sağ tık/boş alan sürükle: kaydır · Shift: ızgarasız hassas · Del: seçiliyi sil · Ctrl+Z: geri al')}
      </div>
    </div>
  )
}

// ─── Şema sembolü tasarım tuvali ──────────────────────────────────────────

type SymTool = 'move' | 'line' | 'rect' | 'circle' | 'arc' | 'text' | 'delete'

/** Açının (radyan) [a0,a1] yayı içinde olup olmadığını sarmalamayı da
 *  dikkate alarak kontrol eder (canvas arc saat yönünde a0→a1 tarar) */
function angleInArc(ang: number, a0: number, a1: number): boolean {
  const TAU = Math.PI * 2
  const norm = (x: number) => ((x % TAU) + TAU) % TAU
  const a = norm(ang)
  const s = norm(a0)
  const e = norm(a1)
  const pad = 0.05
  if (s <= e) return a >= s - pad && a <= e + pad
  return a >= s - pad || a <= e + pad
}

function SymbolCanvas({
  pads,
  bodyW,
  bodyH,
  fpName,
  symbolDef,
  setSymbolDef
}: {
  pads: PadDef[]
  bodyW: number
  bodyH: number
  fpName: string
  symbolDef: SymbolDef | null
  setSymbolDef: (s: SymbolDef | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = useT()
  const ask = usePrompt((s) => s.ask)
  const W = 500
  const H = 360
  const [tool, setTool] = useState<SymTool>('move')
  const [shapeDraft, setShapeDraft] = useState<{ a: Point; b: Point } | null>(null)
  // Yay çizim taslağı: merkez → yarıçap/başlangıç açısı → bitiş açısı (3 tık)
  const [arcDraft, setArcDraft] = useState<
    { cx: number; cy: number; r: number | null; a0: number | null; cursor: Point } | null
  >(null)
  // Seçili öğe — Del ile silinir (pinler hariç), altta düzenlenir
  const [sel, setSel] = useState<{ kind: 'pin' | 'prim'; index: number } | null>(null)
  const dragRef = useRef<
    | { kind: 'pin'; index: number }
    | { kind: 'prim'; index: number; start: Point; orig: SymbolPrim }
    | null
  >(null)

  // ── Klavye: Del = seçili çizimi sil, Esc = iptal ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return
      if (e.key === 'Escape') {
        setShapeDraft(null)
        setArcDraft(null)
        setSel(null)
        setTool('move')
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && symbolDef) {
        if (sel.kind === 'prim') {
          e.preventDefault()
          setSymbolDef({ ...symbolDef, prims: symbolDef.prims.filter((_, j) => j !== sel.index) })
          setSel(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, symbolDef, setSymbolDef])

  // Geçici footprint (otomatik sembol önizlemesi/özelleştirme kaynağı)
  const tmpFp = useMemo<Footprint>(
    () => ({
      id: '__fp_editor_tmp',
      name: fpName || 'tmp',
      description: '',
      category: 'Genel',
      pads,
      silk: [],
      body: { x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH }
    }),
    [pads, bodyW, bodyH, fpName]
  )

  const layout = useMemo(() => {
    const fp: Footprint = symbolDef ? { ...tmpFp, symbol: symbolDef } : tmpFp
    return symbolLayout(fp)
  }, [tmpFp, symbolDef])

  const glyph = useMemo(() => {
    const fp: Footprint = symbolDef ? { ...tmpFp, symbol: symbolDef } : tmpFp
    return schematicGlyph(fp, layout)
  }, [tmpFp, symbolDef, layout])

  // Görünüm: içeriğe sığdır
  const view = useMemo(() => {
    const xs: number[] = [layout.box.x, layout.box.x + layout.box.width]
    const ys: number[] = [layout.box.y, layout.box.y + layout.box.height]
    for (const p of layout.pins) { xs.push(p.end.x); ys.push(p.end.y) }
    const minX = Math.min(...xs) - SCH_GRID
    const maxX = Math.max(...xs) + SCH_GRID
    const minY = Math.min(...ys) - SCH_GRID * 2
    const maxY = Math.max(...ys) + SCH_GRID * 2
    const scale = Math.min(W / (maxX - minX), H / (maxY - minY), 14)
    return {
      scale,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    }
  }, [layout])

  const toLocal = (sx: number, sy: number): Point => ({
    x: (sx - W / 2) / view.scale + view.cx,
    y: (sy - H / 2) / view.scale + view.cy
  })
  const snapG = (p: Point): Point => ({
    x: Math.round(p.x / (SCH_GRID / 2)) * (SCH_GRID / 2),
    y: Math.round(p.y / (SCH_GRID / 2)) * (SCH_GRID / 2)
  })

  /** Özelleştirme başlat: otomatik yerleşimden pin + çizim üret */
  const customize = () => {
    const pins = layout.pins.map((p) => ({
      name: p.name,
      x: p.end.x,
      y: p.end.y,
      side: p.side
    }))
    let prims: SymbolPrim[]
    if (glyph.kind === 'passive' || glyph.kind === 'custom') {
      prims = structuredClone(glyph.prims)
    } else {
      prims = [
        {
          k: 'poly',
          close: true,
          pts: [
            { x: layout.box.x, y: layout.box.y },
            { x: layout.box.x + layout.box.width, y: layout.box.y },
            { x: layout.box.x + layout.box.width, y: layout.box.y + layout.box.height },
            { x: layout.box.x, y: layout.box.y + layout.box.height }
          ]
        }
      ]
    }
    setSymbolDef({ pins, prims, box: { ...layout.box } })
  }

  // ── Çizim ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#101418'
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2 - view.cx * view.scale, H / 2 - view.cy * view.scale)
    ctx.scale(view.scale, view.scale)
    const px = (n: number) => n / view.scale

    // Izgara noktaları
    const tl = toLocal(0, 0)
    const br = toLocal(W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    for (let gx = Math.floor(tl.x / SCH_GRID) * SCH_GRID; gx <= br.x; gx += SCH_GRID) {
      for (let gy = Math.floor(tl.y / SCH_GRID) * SCH_GRID; gy <= br.y; gy += SCH_GRID) {
        ctx.fillRect(gx - px(1), gy - px(1), px(2), px(2))
      }
    }

    // Prim çizici
    const drawPrim = (pr: SymbolPrim, stroke: string) => {
      ctx.strokeStyle = stroke
      ctx.fillStyle = stroke
      ctx.lineWidth = px(pr.k === 'plusminus' || pr.k === 'text' ? 1.6 : ((pr as any).w ?? 1.7))
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (pr.k === 'line') {
        ctx.beginPath(); ctx.moveTo(pr.x1, pr.y1); ctx.lineTo(pr.x2, pr.y2); ctx.stroke()
      } else if (pr.k === 'poly') {
        ctx.beginPath()
        ctx.moveTo(pr.pts[0].x, pr.pts[0].y)
        for (const p of pr.pts.slice(1)) ctx.lineTo(p.x, p.y)
        if (pr.close) ctx.closePath()
        if (pr.fill) ctx.fill()
        else ctx.stroke()
      } else if (pr.k === 'circle') {
        ctx.beginPath(); ctx.arc(pr.cx, pr.cy, pr.r, 0, Math.PI * 2)
        if (pr.fill) ctx.fill(); else ctx.stroke()
      } else if (pr.k === 'arc') {
        ctx.beginPath(); ctx.arc(pr.cx, pr.cy, pr.r, pr.a0, pr.a1); ctx.stroke()
      } else if (pr.k === 'plusminus') {
        ctx.beginPath()
        ctx.moveTo(pr.x - pr.s, pr.y); ctx.lineTo(pr.x + pr.s, pr.y)
        if (!pr.minus) { ctx.moveTo(pr.x, pr.y - pr.s); ctx.lineTo(pr.x, pr.y + pr.s) }
        ctx.stroke()
      } else if (pr.k === 'text') {
        ctx.font = `${pr.size ?? 2.2}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(pr.text, pr.x, pr.y)
        ctx.textBaseline = 'alphabetic'
      }
    }

    // Gövde
    if (symbolDef) {
      for (const pr of symbolDef.prims) drawPrim(pr, '#4ea1d3')
    } else if (glyph.kind === 'passive') {
      for (const pr of glyph.prims) drawPrim(pr, '#4ea1d3')
    } else {
      ctx.strokeStyle = '#4ea1d3'
      ctx.lineWidth = px(1.5)
      ctx.strokeRect(layout.box.x, layout.box.y, layout.box.width, layout.box.height)
    }

    // Taslak
    if (shapeDraft) {
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = px(1.5)
      ctx.beginPath()
      if (tool === 'line') {
        ctx.moveTo(shapeDraft.a.x, shapeDraft.a.y); ctx.lineTo(shapeDraft.b.x, shapeDraft.b.y)
      } else if (tool === 'rect') {
        ctx.strokeRect(
          Math.min(shapeDraft.a.x, shapeDraft.b.x),
          Math.min(shapeDraft.a.y, shapeDraft.b.y),
          Math.abs(shapeDraft.b.x - shapeDraft.a.x),
          Math.abs(shapeDraft.b.y - shapeDraft.a.y)
        )
      } else if (tool === 'circle') {
        const r = Math.hypot(shapeDraft.b.x - shapeDraft.a.x, shapeDraft.b.y - shapeDraft.a.y)
        ctx.arc(shapeDraft.a.x, shapeDraft.a.y, Math.max(r, 0.01), 0, Math.PI * 2)
      }
      ctx.stroke()
    }

    // Yay taslağı (3 tıklık akış: merkez → yarıçap/başlangıç → bitiş)
    if (arcDraft) {
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = px(1.2)
      ctx.beginPath()
      ctx.moveTo(arcDraft.cx - px(4), arcDraft.cy)
      ctx.lineTo(arcDraft.cx + px(4), arcDraft.cy)
      ctx.moveTo(arcDraft.cx, arcDraft.cy - px(4))
      ctx.lineTo(arcDraft.cx, arcDraft.cy + px(4))
      ctx.stroke()
      if (arcDraft.r === null) {
        const liveR = Math.hypot(arcDraft.cursor.x - arcDraft.cx, arcDraft.cursor.y - arcDraft.cy)
        ctx.setLineDash([px(3), px(3)])
        ctx.beginPath()
        ctx.arc(arcDraft.cx, arcDraft.cy, liveR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        const curA = Math.atan2(arcDraft.cursor.y - arcDraft.cy, arcDraft.cursor.x - arcDraft.cx)
        ctx.setLineDash([px(3), px(3)])
        ctx.beginPath()
        ctx.arc(arcDraft.cx, arcDraft.cy, arcDraft.r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        if (arcDraft.a0 !== null) {
          ctx.lineWidth = px(2.2)
          ctx.beginPath()
          ctx.arc(arcDraft.cx, arcDraft.cy, arcDraft.r, arcDraft.a0, curA)
          ctx.stroke()
        }
      }
    }

    // Pinler (uç + bacak + ad)
    for (const pin of layout.pins) {
      ctx.strokeStyle = '#89c4e8'
      ctx.lineWidth = px(1.5)
      ctx.beginPath()
      ctx.moveTo(pin.end.x, pin.end.y)
      ctx.lineTo(pin.inner.x, pin.inner.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pin.end.x, pin.end.y, px(3.2), 0, Math.PI * 2)
      ctx.fillStyle = symbolDef ? '#ffd166' : '#89c4e8'
      ctx.fill()
      ctx.fillStyle = '#a9b6c4'
      ctx.font = `${px(10)}px system-ui, sans-serif`
      ctx.textAlign = pin.side === 'left' ? 'left' : 'right'
      ctx.fillText(
        pin.name,
        pin.side === 'left' ? pin.inner.x + px(4) : pin.inner.x - px(4),
        pin.inner.y + px(4)
      )
    }

    // Seçim vurgusu (cyan)
    if (sel && symbolDef) {
      ctx.strokeStyle = '#3fd3dc'
      ctx.lineWidth = px(1.6)
      ctx.setLineDash([px(4), px(3)])
      if (sel.kind === 'pin' && symbolDef.pins[sel.index]) {
        const p = symbolDef.pins[sel.index]
        ctx.beginPath()
        ctx.arc(p.x, p.y, px(7), 0, Math.PI * 2)
        ctx.stroke()
      } else if (sel.kind === 'prim' && symbolDef.prims[sel.index]) {
        const pr = symbolDef.prims[sel.index]
        if (pr.k === 'line') {
          ctx.beginPath(); ctx.moveTo(pr.x1, pr.y1); ctx.lineTo(pr.x2, pr.y2); ctx.stroke()
        } else if (pr.k === 'poly') {
          ctx.beginPath()
          ctx.moveTo(pr.pts[0].x, pr.pts[0].y)
          for (const p of pr.pts.slice(1)) ctx.lineTo(p.x, p.y)
          if (pr.close) ctx.closePath()
          ctx.stroke()
        } else if (pr.k === 'circle' || pr.k === 'arc') {
          ctx.beginPath(); ctx.arc(pr.cx, pr.cy, pr.r + px(2), 0, Math.PI * 2); ctx.stroke()
        } else {
          ctx.strokeRect(pr.x - px(14), pr.y - px(9), px(28), px(18))
        }
      }
      ctx.setLineDash([])
    }
    ctx.restore()

    if (!symbolDef) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(t('Otomatik sembol — düzenlemek için "Özelleştir"e basın'), W / 2, H - 12)
    }
  })

  const hitPin = (loc: Point): number => {
    if (!symbolDef) return -1
    const tol = 8 / view.scale
    return symbolDef.pins.findIndex((p) => Math.hypot(p.x - loc.x, p.y - loc.y) <= tol)
  }

  const hitPrim = (loc: Point): number => {
    if (!symbolDef) return -1
    const tol = 6 / view.scale
    for (let i = symbolDef.prims.length - 1; i >= 0; i--) {
      const pr = symbolDef.prims[i]
      if (pr.k === 'line') {
        if (segPointDist({ x: pr.x1, y: pr.y1 }, { x: pr.x2, y: pr.y2 }, loc) <= tol) return i
      } else if (pr.k === 'poly') {
        for (let j = 0; j < pr.pts.length - (pr.close ? 0 : 1); j++) {
          const a = pr.pts[j]
          const b = pr.pts[(j + 1) % pr.pts.length]
          if (segPointDist(a, b, loc) <= tol) return i
        }
      } else if (pr.k === 'circle' || pr.k === 'arc') {
        const d = Math.hypot(loc.x - pr.cx, loc.y - pr.cy)
        if (Math.abs(d - pr.r) <= tol) {
          if (pr.k === 'circle') return i
          const ang = Math.atan2(loc.y - pr.cy, loc.x - pr.cx)
          if (angleInArc(ang, pr.a0, pr.a1)) return i
        }
      } else {
        if (Math.hypot(loc.x - pr.x, loc.y - pr.y) <= tol * 2) return i
      }
    }
    return -1
  }

  const onDown = async (e: React.MouseEvent) => {
    if (e.button !== 0 || !symbolDef) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const loc = toLocal(e.clientX - rect.left, e.clientY - rect.top)
    const sp = snapG(loc)

    switch (tool) {
      case 'move': {
        const pi = hitPin(loc)
        if (pi >= 0) {
          setSel({ kind: 'pin', index: pi })
          dragRef.current = { kind: 'pin', index: pi }
          return
        }
        const ri = hitPrim(loc)
        if (ri >= 0) {
          setSel({ kind: 'prim', index: ri })
          dragRef.current = { kind: 'prim', index: ri, start: loc, orig: structuredClone(symbolDef.prims[ri]) }
          return
        }
        setSel(null)
        return
      }
      case 'line':
      case 'rect':
      case 'circle':
        setShapeDraft({ a: sp, b: sp })
        return
      case 'arc': {
        if (!arcDraft) {
          setArcDraft({ cx: sp.x, cy: sp.y, r: null, a0: null, cursor: sp })
        } else if (arcDraft.r === null) {
          const r = Math.hypot(loc.x - arcDraft.cx, loc.y - arcDraft.cy)
          if (r < 0.3) return
          const a0 = Math.atan2(loc.y - arcDraft.cy, loc.x - arcDraft.cx)
          setArcDraft({ ...arcDraft, r, a0, cursor: loc })
        } else if (arcDraft.a0 !== null) {
          const a0 = arcDraft.a0
          const r = arcDraft.r
          const a1 = Math.atan2(loc.y - arcDraft.cy, loc.x - arcDraft.cx)
          setSymbolDef({
            ...symbolDef,
            prims: [
              ...symbolDef.prims,
              { k: 'arc', cx: arcDraft.cx, cy: arcDraft.cy, r: +r.toFixed(2), a0, a1, w: 1.2 }
            ]
          })
          setArcDraft(null)
        }
        return
      }
      case 'text': {
        const txt = await ask(t('Sembol yazısı'), '', t('Örn: OPAMP, +, K'))
        if (txt && txt.trim()) {
          setSymbolDef({
            ...symbolDef,
            prims: [...symbolDef.prims, { k: 'text', x: sp.x, y: sp.y, text: txt.trim(), size: 2.2 }]
          })
        }
        return
      }
      case 'delete': {
        setSel(null)
        const ri = hitPrim(loc)
        if (ri >= 0) {
          setSymbolDef({ ...symbolDef, prims: symbolDef.prims.filter((_, j) => j !== ri) })
        }
        return
      }
    }
  }

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const loc = toLocal(e.clientX - rect.left, e.clientY - rect.top)
    if (shapeDraft) {
      setShapeDraft({ a: shapeDraft.a, b: snapG(loc) })
      return
    }
    if (arcDraft) {
      setArcDraft({ ...arcDraft, cursor: loc })
      return
    }
    const drag = dragRef.current
    if (!drag || !symbolDef) return
    if (drag.kind === 'pin') {
      const sp = snapG(loc)
      setSymbolDef({
        ...symbolDef,
        pins: symbolDef.pins.map((p, j) =>
          j === drag.index ? { ...p, x: sp.x, y: sp.y } : p
        )
      })
    } else if (drag.kind === 'prim') {
      const dx = loc.x - drag.start.x
      const dy = loc.y - drag.start.y
      const o = drag.orig
      const moved: SymbolPrim = (() => {
        if (o.k === 'line') return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
        if (o.k === 'poly') return { ...o, pts: o.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
        if (o.k === 'circle' || o.k === 'arc') return { ...o, cx: o.cx + dx, cy: o.cy + dy }
        return { ...o, x: o.x + dx, y: o.y + dy }
      })()
      setSymbolDef({
        ...symbolDef,
        prims: symbolDef.prims.map((p, j) => (j === drag.index ? moved : p))
      })
    }
  }

  const onUp = () => {
    if (shapeDraft && symbolDef) {
      const { a, b } = shapeDraft
      if (tool === 'line' && Math.hypot(b.x - a.x, b.y - a.y) >= 0.5) {
        setSymbolDef({ ...symbolDef, prims: [...symbolDef.prims, { k: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }] })
      } else if (tool === 'rect' && Math.abs(b.x - a.x) >= 0.5 && Math.abs(b.y - a.y) >= 0.5) {
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
        const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
        setSymbolDef({
          ...symbolDef,
          prims: [
            ...symbolDef.prims,
            { k: 'poly', close: true, pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }
          ]
        })
      } else if (tool === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y)
        if (r >= 0.5) {
          setSymbolDef({ ...symbolDef, prims: [...symbolDef.prims, { k: 'circle', cx: a.x, cy: a.y, r: +r.toFixed(2) }] })
        }
      }
      setShapeDraft(null)
    }
    dragRef.current = null
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!symbolDef) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const loc = toLocal(e.clientX - rect.left, e.clientY - rect.top)
    const pi = hitPin(loc)
    if (pi >= 0) {
      // Pin yönünü değiştir (sol ↔ sağ) — bacak ve ad hizası döner
      setSymbolDef({
        ...symbolDef,
        pins: symbolDef.pins.map((p, j) =>
          j === pi ? { ...p, side: p.side === 'left' ? 'right' : 'left' } : p
        )
      })
    }
  }

  const symToolBtn = (id: SymTool, icon: ReactNode, label: string, title: string) => (
    <button
      type="button"
      className={tool === id ? 'active' : ''}
      disabled={!symbolDef}
      onClick={() => { setTool(id); setShapeDraft(null); setArcDraft(null) }}
      title={title}
    >
      {icon} {label}
    </button>
  )

  return (
    <div>
      <div className="fp-canvas-tools">
        {!symbolDef ? (
          <button type="button" className="btn-primary" onClick={customize}>
            <Icon name="edit" size={13} /> {t('Özelleştir')}
          </button>
        ) : (
          <>
            {symToolBtn('move', <Icon name="move" size={14} />, t('Taşı'), t('Pin ve çizimleri taşı · pine çift tık: yön değiştir'))}
            {symToolBtn('line', '╱', t('Çizgi'), t('Çizgi çiz (sürükle)'))}
            {symToolBtn('rect', '▭', t('Kutu'), t('Dikdörtgen çiz (sürükle)'))}
            {symToolBtn('circle', '◯', t('Daire'), t('Daire çiz (merkezden sürükle)'))}
            {symToolBtn('arc', '◜', t('Yay'), t('Yay çiz — merkeze tıkla, yarıçap için tıkla, bitiş açısı için tıkla'))}
            {symToolBtn('text', <Icon name="text" size={14} />, t('Yazı'), t('Yazı ekle'))}
            {symToolBtn('delete', <Icon name="trash" size={14} />, t('Sil'), t('Çizim öğesi sil'))}
            <button
              type="button"
              className="btn-danger-outline"
              onClick={() => setSymbolDef(null)}
              title={t('Otomatik sembole (kutu/standart glif) geri dön')}
            >
              ↺ {t('Otomatik')}
            </button>
          </>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: W, height: H, cursor: symbolDef && tool !== 'move' ? 'crosshair' : 'default' }}
        className="footprint-preview"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {sel && symbolDef && (() => {
        // Seçili öğe özellik çubuğu — sembol nesneleri sonradan da düzenlenir
        if (sel.kind === 'pin' && symbolDef.pins[sel.index]) {
          const p = symbolDef.pins[sel.index]
          const up = (patch: Partial<typeof p>) =>
            setSymbolDef({
              ...symbolDef,
              pins: symbolDef.pins.map((q, j) => (j === sel.index ? { ...q, ...patch } : q))
            })
          return (
            <div className="fp-props">
              <b>● {t('Pin')} {p.name}</b>
              <label>X<input type="number" step={SCH_GRID / 2} value={p.x} onChange={(e) => up({ x: parseFloat(e.target.value) || 0 })} /></label>
              <label>Y<input type="number" step={SCH_GRID / 2} value={p.y} onChange={(e) => up({ y: parseFloat(e.target.value) || 0 })} /></label>
              <button type="button" onClick={() => up({ side: p.side === 'left' ? 'right' : 'left' })}>
                ⇄ {p.side === 'left' ? t('Sol') : t('Sağ')}
              </button>
            </div>
          )
        }
        if (sel.kind === 'prim' && symbolDef.prims[sel.index]) {
          const pr = symbolDef.prims[sel.index]
          const up = (next: SymbolPrim) =>
            setSymbolDef({
              ...symbolDef,
              prims: symbolDef.prims.map((q, j) => (j === sel.index ? next : q))
            })
          if (pr.k === 'text') {
            return (
              <div className="fp-props">
                <b>A {t('Yazı')}</b>
                <label>{t('Metin')}<input type="text" value={pr.text} onChange={(e) => up({ ...pr, text: e.target.value })} /></label>
                <label>{t('Boyut')}<input type="number" step={0.2} min={0.8} value={pr.size ?? 2.2} onChange={(e) => up({ ...pr, size: Math.max(0.8, parseFloat(e.target.value) || 2.2) })} /></label>
              </div>
            )
          }
          if (pr.k === 'circle') {
            return (
              <div className="fp-props">
                <b>◯ {t('Daire')}</b>
                <label>R<input type="number" step={0.25} min={0.25} value={pr.r} onChange={(e) => up({ ...pr, r: Math.max(0.25, parseFloat(e.target.value) || 1) })} /></label>
                <label>
                  <input type="checkbox" checked={!!pr.fill} onChange={(e) => up({ ...pr, fill: e.target.checked })} /> {t('Dolu')}
                </label>
              </div>
            )
          }
          if (pr.k === 'arc') {
            const deg = (r: number) => Math.round((r * 180) / Math.PI)
            const rad = (d: number) => (d * Math.PI) / 180
            return (
              <div className="fp-props">
                <b>◜ {t('Yay')}</b>
                <label>R<input type="number" step={0.25} min={0.25} value={pr.r} onChange={(e) => up({ ...pr, r: Math.max(0.25, parseFloat(e.target.value) || 1) })} /></label>
                <label>{t('Başlangıç°')}<input type="number" step={5} value={deg(pr.a0)} onChange={(e) => up({ ...pr, a0: rad(parseFloat(e.target.value) || 0) })} /></label>
                <label>{t('Bitiş°')}<input type="number" step={5} value={deg(pr.a1)} onChange={(e) => up({ ...pr, a1: rad(parseFloat(e.target.value) || 0) })} /></label>
                <label>{t('Kalınlık')}<input type="number" step={0.2} min={0.4} value={pr.w ?? 1.2} onChange={(e) => up({ ...pr, w: Math.max(0.4, parseFloat(e.target.value) || 1.2) })} /></label>
              </div>
            )
          }
          if (pr.k === 'poly') {
            return (
              <div className="fp-props">
                <b>▭ {t('Çokgen')}</b>
                <label>
                  <input type="checkbox" checked={!!pr.fill} onChange={(e) => up({ ...pr, fill: e.target.checked })} /> {t('Dolu')}
                </label>
                <label>
                  <input type="checkbox" checked={!!pr.close} onChange={(e) => up({ ...pr, close: e.target.checked })} /> {t('Kapalı')}
                </label>
              </div>
            )
          }
          if (pr.k === 'line') {
            return (
              <div className="fp-props">
                <b>╱ {t('Çizgi')}</b>
                <label>{t('Kalınlık')}<input type="number" step={0.2} min={0.4} value={pr.w ?? 1.7} onChange={(e) => up({ ...pr, w: Math.max(0.4, parseFloat(e.target.value) || 1.7) })} /></label>
              </div>
            )
          }
          return null
        }
        return null
      })()}
      <div className="fp-canvas-hint">
        {symbolDef
          ? t('Sarı noktalar pin uçlarıdır (tel buraya bağlanır) — sürükleyin, çift tıkla yön değiştirin. Pinler pad adlarıyla eşleşir. Del: seçili çizimi sil')
          : t('Bu footprint şemada otomatik sembolle gösterilir. Özelleştir ile kendi çiziminizi yapın; kaydedince şemada kullanılır.')}
      </div>
    </div>
  )
}

// ─── 3B model sekmesi ─────────────────────────────────────────────────────

function Model3DTab({
  pads,
  bodyW,
  bodyH,
  fpName,
  model3d,
  setModel3d
}: {
  pads: PadDef[]
  bodyW: number
  bodyH: number
  fpName: string
  model3d: FootprintModel3D | null
  setModel3d: (m: FootprintModel3D | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = useT()
  const W = 500
  const H = 300
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const camRef = useRef<Camera | null>(null)
  const [, setTick] = useState(0)
  const redraw = () => setTick((n) => n + 1)
  const drag = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 })

  // Önizleme projesi: footprint'i ortasına oturtan küçük bir kart
  const preview = useMemo(() => {
    const fp: Footprint = {
      id: '__fp_3d_tmp',
      name: fpName || 'tmp',
      description: '',
      category: 'Genel',
      pads,
      silk: [],
      body: { x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH },
      ...(model3d ? { model3d } : {})
    }
    const proj = newProject('3d-önizleme')
    const bw = Math.max(16, bodyW * 2.2)
    const bh = Math.max(14, bodyH * 2.2)
    proj.board.width = bw
    proj.board.height = bh
    proj.board.mountingHoles = []
    proj.board.cornerRadius = 1
    proj.components.push({
      id: '__c1',
      footprintId: fp.id,
      refDes: 'U1',
      value: '',
      x: bw / 2,
      y: bh / 2,
      rotation: 0,
      side: 'top',
      padNets: {}
    })
    return { proj, fp }
  }, [pads, bodyW, bodyH, fpName, model3d])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!camRef.current) camRef.current = fit3DCamera(preview.proj)
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render3D(ctx, {
      project: preview.proj,
      getFootprint: () => preview.fp,
      camera: camRef.current,
      width: W,
      height: H,
      showComponents: true,
      showTraces: false,
      showModels: false
    })
  })

  const kind: 'auto' | 'param' | 'mesh' = model3d?.kind ?? 'auto'

  const importMesh = async () => {
    setErr('')
    try {
      const file = await pickModelFile()
      if (!file) return
      setBusy(true)
      const m = await loadFootprintMeshFromFile(file, { width: bodyW, height: bodyH })
      setModel3d({ ...m, color: model3d?.color ?? m.color })
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="fp-canvas-tools">
        <label className="fp-3d-kind">
          <input type="radio" checked={kind === 'auto'} onChange={() => setModel3d(null)} />
          {t('Otomatik')}
        </label>
        <label className="fp-3d-kind">
          <input
            type="radio"
            checked={kind === 'param'}
            onChange={() =>
              setModel3d({
                kind: 'param',
                shape: 'box',
                height: 3,
                color: model3d?.color ?? '#2e3138'
              })
            }
          />
          {t('Basit şekil')}
        </label>
        <label className="fp-3d-kind">
          <input type="radio" checked={kind === 'mesh'} onChange={importMesh} />
          {t('OBJ/STL model')}
        </label>
      </div>

      {kind === 'param' && model3d && (
        <div className="fp-canvas-tools">
          <select
            value={model3d.shape ?? 'box'}
            onChange={(e) => setModel3d({ ...model3d, shape: e.target.value as 'box' | 'cyl' })}
          >
            <option value="box">{t('Kutu')}</option>
            <option value="cyl">{t('Silindir')}</option>
          </select>
          <label className="fp-3d-field">
            {t('Yükseklik')}
            <input
              type="number"
              step={0.5}
              min={0.2}
              value={model3d.height ?? 3}
              onChange={(e) => setModel3d({ ...model3d, height: Math.max(0.2, parseFloat(e.target.value) || 3) })}
            />
            mm
          </label>
          <label className="fp-3d-field">
            {t('Renk')}
            <input
              type="color"
              value={model3d.color ?? '#2e3138'}
              onChange={(e) => setModel3d({ ...model3d, color: e.target.value })}
            />
          </label>
        </div>
      )}

      {kind === 'mesh' && model3d && (
        <div className="fp-canvas-tools">
          <button type="button" disabled={busy} onClick={importMesh}>
            <Icon name="folder" size={13} /> {model3d.name ? `${model3d.name}` : t('Model seç')}
          </button>
          <label className="fp-3d-field">
            {t('Ölçek')}
            <input
              type="number"
              step={0.05}
              min={0.001}
              value={model3d.scale ?? 1}
              onChange={(e) => setModel3d({ ...model3d, scale: parseFloat(e.target.value) || 1 })}
            />
          </label>
          <label className="fp-3d-field">
            {t('Dönüş')}
            <input
              type="number"
              step={15}
              value={model3d.rotZ ?? 0}
              onChange={(e) => setModel3d({ ...model3d, rotZ: parseFloat(e.target.value) || 0 })}
            />
            °
          </label>
          <label className="fp-3d-field">
            Z
            <input
              type="number"
              step={0.25}
              value={model3d.z ?? 0}
              onChange={(e) => setModel3d({ ...model3d, z: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label className="fp-3d-field">
            {t('Renk')}
            <input
              type="color"
              value={model3d.color ?? '#9aa4b2'}
              onChange={(e) => setModel3d({ ...model3d, color: e.target.value })}
            />
          </label>
        </div>
      )}
      {err && <div className="fp-3d-err">⚠ {err}</div>}

      <div className="fp-3d-labels">
        <div className="fp-canvas-tools">
          <button
            type="button"
            onClick={() => {
              // "Otomatik" modda model3d henüz yok — yazı eklemek için basit
              // bir gövdeye geçilir (mevcut "Basit şekil" varsayılanlarıyla aynı)
              const base = model3d ?? { kind: 'param' as const, shape: 'box' as const, height: 3, color: '#2e3138' }
              setModel3d({
                ...base,
                labels: [
                  ...(base.labels ?? []),
                  { text: 'TXT', x: 0, y: 0, z: (base.kind === 'param' ? base.height ?? 3 : 1) + 0.2, size: 1, color: '#ffffff', rotZ: 0 }
                ]
              })
            }}
          >
            <Icon name="plus" size={13} /> {t('Model Üstüne Yazı Ekle')}
          </button>
        </div>
        {(model3d?.labels ?? []).map((lbl, i) => {
          const upLbl = (patch: Partial<FootprintModelLabel>) => {
            if (!model3d) return
            setModel3d({
              ...model3d,
              labels: (model3d.labels ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l))
            })
          }
          const removeLbl = () => {
            if (!model3d) return
            setModel3d({ ...model3d, labels: (model3d.labels ?? []).filter((_, j) => j !== i) })
          }
          return (
            <div className="fp-3d-label-row" key={i}>
              <input
                type="text"
                value={lbl.text}
                onChange={(e) => upLbl({ text: e.target.value })}
                className="fp-3d-label-text"
              />
              <label className="fp-3d-field">X<input type="number" step={0.5} value={lbl.x} onChange={(e) => upLbl({ x: parseFloat(e.target.value) || 0 })} /></label>
              <label className="fp-3d-field">Y<input type="number" step={0.5} value={lbl.y} onChange={(e) => upLbl({ y: parseFloat(e.target.value) || 0 })} /></label>
              <label className="fp-3d-field">Z<input type="number" step={0.1} value={lbl.z ?? 0} onChange={(e) => upLbl({ z: parseFloat(e.target.value) || 0 })} /></label>
              <label className="fp-3d-field">{t('Boyut')}<input type="number" step={0.1} min={0.2} value={lbl.size ?? 1} onChange={(e) => upLbl({ size: Math.max(0.2, parseFloat(e.target.value) || 1) })} /></label>
              <label className="fp-3d-field">{t('Dönüş')}<input type="number" step={15} value={lbl.rotZ ?? 0} onChange={(e) => upLbl({ rotZ: parseFloat(e.target.value) || 0 })} />°</label>
              <input type="color" value={lbl.color ?? '#ffffff'} onChange={(e) => upLbl({ color: e.target.value })} />
              <button type="button" className="btn-danger-outline" onClick={removeLbl} title={t('Yazıyı sil')}><Icon name="close" size={12} /></button>
            </div>
          )
        })}
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: W, height: H, cursor: 'grab' }}
        className="footprint-preview"
        onMouseDown={(e) => { drag.current = { on: true, x: e.clientX, y: e.clientY } }}
        onMouseMove={(e) => {
          if (!drag.current.on || !camRef.current) return
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          drag.current.x = e.clientX
          drag.current.y = e.clientY
          camRef.current.yaw += dx * 0.01
          camRef.current.pitch = Math.max(
            -Math.PI / 2 + 0.05,
            Math.min(Math.PI / 2 - 0.05, camRef.current.pitch - dy * 0.01)
          )
          redraw()
        }}
        onMouseUp={() => { drag.current.on = false }}
        onMouseLeave={() => { drag.current.on = false }}
        onWheel={(e) => {
          if (!camRef.current) return
          camRef.current.dist = Math.max(6, Math.min(600, camRef.current.dist * Math.exp(e.deltaY * 0.0012)))
          redraw()
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="fp-canvas-hint">
        {kind === 'auto'
          ? t('3B görünümde kategoriye göre otomatik basit gövde üretilir. Basit şekil veya OBJ/STL model atayabilirsiniz.')
          : t('Sürükle: döndür · Tekerlek: yakınlaştır. Model kaydedilen footprint ile birlikte saklanır ve 3B görünümde kullanılır.')}
      </div>
    </div>
  )
}
