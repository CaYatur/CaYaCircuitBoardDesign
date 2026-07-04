// ─── Özel footprint editörü ───────────────────────────────────────────────
// Kullanıcı kendi ölçüleriyle komponent oluşturur veya HAZIR footprint'leri
// düzenler (yerleşikler kopyalanarak özelleştirilir). Pad tablosu + canlı
// önizleme. Kaydedilenler projeyle saklanır, .cayalib olarak paylaşılabilir.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUserLibrary } from '../state/userLibrary'
import type { Footprint, PadDef, SilkElement } from '../types'
import { uid } from '../types'
import { usePrompt } from './prompts'
import { useT } from '../i18n'

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
  const [loadedSilk, setLoadedSilk] = useState<SilkElement[] | null>(null)
  const [loadedBody, setLoadedBody] = useState<{ w: number; h: number } | null>(null)
  const [sourceNote, setSourceNote] = useState('')

  // Hızlı üreteç durumu
  const [genRows, setGenRows] = useState(1)
  const [genCols, setGenCols] = useState(4)
  const [genPitch, setGenPitch] = useState(2.54)
  const [genRowSpacing, setGenRowSpacing] = useState(7.62)

  const loadFootprint = (fp: Footprint, asCopy: boolean) => {
    setEditingId(asCopy ? null : fp.id)
    setName(asCopy ? `${fp.name} (${t('özel')})` : fp.name)
    setCategory(fp.category)
    setDescription(fp.description)
    setBodyW(fp.body.width)
    setBodyH(fp.body.height)
    setPads(structuredClone(fp.pads))
    setLoadedSilk(structuredClone(fp.silk))
    setLoadedBody({ w: fp.body.width, h: fp.body.height })
    setSourceNote(
      asCopy
        ? t('Yerleşik "{name}" kopyalanıyor — kaydedince Özel kategorisine eklenir', { name: fp.name })
        : ''
    )
  }

  // Dışarıdan hedefle açıldıysa yükle (builtin → kopya, custom → yerinde düzenle)
  useEffect(() => {
    if (activeDialog === 'footprint-editor' && target) {
      const fp = getFootprint(target)
      if (fp) loadFootprint(fp, !fp.custom)
      useStore.setState({ footprintEditorTarget: null })
    }
  }, [activeDialog, target, getFootprint])

  if (activeDialog !== 'footprint-editor') return null

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setCategory('Genel')
    setDescription('')
    setSavedFlash(false)
    setBodyW(10)
    setBodyH(10)
    setPads([emptyPad(1), emptyPad(2)])
    setLoadedSilk(null)
    setLoadedBody(null)
    setSourceNote('')
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
    setLoadedSilk(null)
  }

  const save = () => {
    if (pads.length === 0) {
      setStatus(t('En az bir pad gerekli'))
      return
    }
    // Gövde boyutu değişmediyse orijinal silkscreen korunur
    const keepSilk =
      loadedSilk &&
      loadedBody &&
      Math.abs(loadedBody.w - bodyW) < 0.01 &&
      Math.abs(loadedBody.h - bodyH) < 0.01
    const fp: Footprint = {
      id: editingId ?? uid('fp-'),
      name: name.trim() || t('İsimsiz'),
      description: description.trim() || `${pads.length} pad`,
      category,
      pads: pads.map((p) => ({
        ...p,
        ...(p.layer === 'both' ? {} : { drill: undefined })
      })),
      silk: keepSilk
        ? loadedSilk!
        : [
            { kind: 'line', x1: -bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: -bodyH / 2, width: 0.2 },
            { kind: 'line', x1: bodyW / 2, y1: -bodyH / 2, x2: bodyW / 2, y2: bodyH / 2, width: 0.2 },
            { kind: 'line', x1: bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: bodyH / 2, width: 0.2 },
            { kind: 'line', x1: -bodyW / 2, y1: bodyH / 2, x2: -bodyW / 2, y2: -bodyH / 2, width: 0.2 }
          ],
      body: { x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH },
      custom: true
    }
    // Kullanıcı kütüphanesine kaydet (otomatik kalıcı — "Kaydet" gerektirmez)
    saveFootprint(fp)
    // Düzenlemeye devam et — yeni boş karta atlama (bireysel düzenleme)
    setEditingId(fp.id)
    setLoadedBody({ w: bodyW, h: bodyH })
    setLoadedSilk(fp.silk)
    setSourceNote('')
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1600)
    setStatus(
      t('"{name}" kütüphaneye kaydedildi (otomatik) — {cat} kategorisi', {
        name: fp.name,
        cat: t(category)
      })
    )
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal footprint-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            ⬡ {t('Footprint Editörü')}{' '}
            {editingId ? (
              <small>({t('düzenleniyor')}: {name || t('İsimsiz')})</small>
            ) : (
              <small>({t('yeni')})</small>
            )}
            {savedFlash && <span className="saved-flash">✓ {t('Kaydedildi')}</span>}
          </h3>
          <button onClick={() => openDialog(null)}>✕</button>
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
                  >✓</button>
                  <button type="button" onClick={() => { setAddingCat(false); setNewCatName('') }}>✕</button>
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
                  >＋</button>
                  <button
                    type="button"
                    className="btn-secondary btn-danger-outline"
                    title={t('Bu kategoriyi sil (içindekiler Genel\'e taşınır)')}
                    disabled={category === 'Genel'}
                    onClick={() => askDeleteCategory(category)}
                  >🗑</button>
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
              <h4>⚡ {t('Hızlı pad üreteci')}</h4>
              <div className="field-row">
                <div className="field">
                  <label>{t('Sıra')}</label>
                  <input type="number" min={1} max={4} value={genRows} onChange={(e) => setGenRows(parseInt(e.target.value) || 1)} />
                </div>
                <div className="field">
                  <label>{t('Sütun')}</label>
                  <input type="number" min={1} max={40} value={genCols} onChange={(e) => setGenCols(parseInt(e.target.value) || 1)} />
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
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setPads((ps) => [...ps, emptyPad(ps.length + 1)])}>
              ＋ {t('Pad Ekle')}
            </button>

            <div className="modal-buttons">
              <button className="btn-secondary" onClick={resetForm} title={t('Yeni boş footprint\'e geç')}>
                ＋ {t('Yeni (boş)')}
              </button>
              <button className="btn-primary" onClick={save}>
                {editingId ? '💾 ' + t('Güncelle') : '💾 ' + t('Kütüphaneye Kaydet')}
              </button>
            </div>
            <p className="calc-note">
              {t('Değişiklikler otomatik kaydedilir ve PC\'de/tarayıcıda kalıcıdır. Kaydedince bu footprint\'i düzenlemeye devam edersiniz.')}
            </p>
          </div>

          <div className="footprint-side">
            <FootprintPreview pads={pads} bodyW={bodyW} bodyH={bodyH} />
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
                            <button onClick={() => loadFootprint(fp, false)} title={t('Düzenle')}>✎</button>
                            <button onClick={() => removeFootprint(fp.id)} title={t('Sil')}>🗑</button>
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
  )
}

/** Canlı önizleme */
function FootprintPreview({
  pads,
  bodyW,
  bodyH
}: {
  pads: PadDef[]
  bodyW: number
  bodyH: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = useT()
  const W = 340
  const H = 300

  const extent = useMemo(() => {
    let maxX = bodyW / 2
    let maxY = bodyH / 2
    for (const p of pads) {
      maxX = Math.max(maxX, Math.abs(p.x) + p.width / 2)
      maxY = Math.max(maxY, Math.abs(p.y) + p.height / 2)
    }
    return { maxX: maxX + 2, maxY: maxY + 2 }
  }, [pads, bodyW, bodyH])

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
    const scale = Math.min(W / (extent.maxX * 2), H / (extent.maxY * 2))
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.scale(scale, scale)

    // Izgara (1.27 adım)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    for (let gx = -extent.maxX; gx <= extent.maxX; gx += 1.27) {
      for (let gy = -extent.maxY; gy <= extent.maxY; gy += 1.27) {
        ctx.fillRect(gx - 0.05, gy - 0.05, 0.1, 0.1)
      }
    }

    // Gövde
    ctx.strokeStyle = '#e8e8e8'
    ctx.lineWidth = 0.2
    ctx.strokeRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH)

    // Pad'ler
    for (const pad of pads) {
      ctx.fillStyle =
        pad.layer === 'both' ? '#d4af37' : pad.layer === 'top' ? '#d94f3d' : '#4a7fdb'
      if (pad.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(pad.x, pad.y, Math.max(pad.width, pad.height) / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (pad.shape === 'oval') {
        // Stadyum (yuvarlatılmış uçlu) — kareden farklı görünür
        const r = Math.min(pad.width, pad.height) / 2
        const x = pad.x - pad.width / 2
        const y = pad.y - pad.height / 2
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + pad.width, y, x + pad.width, y + pad.height, r)
        ctx.arcTo(x + pad.width, y + pad.height, x, y + pad.height, r)
        ctx.arcTo(x, y + pad.height, x, y, r)
        ctx.arcTo(x, y, x + pad.width, y, r)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(pad.x - pad.width / 2, pad.y - pad.height / 2, pad.width, pad.height)
      }
      if (pad.layer === 'both' && pad.drill) {
        ctx.fillStyle = '#0e1116'
        ctx.beginPath()
        ctx.arc(pad.x, pad.y, pad.drill / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      // Pad adı
      ctx.fillStyle = '#fff'
      ctx.font = '1px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(pad.name, pad.x, pad.y - Math.max(pad.width, pad.height) / 2 - 0.3)
    }
    ctx.restore()

    // Ölçek bilgisi
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(
      `${t('Önizleme')} — ${(extent.maxX * 2).toFixed(1)} × ${(extent.maxY * 2).toFixed(1)} mm`,
      8,
      H - 8
    )
  }, [pads, bodyW, bodyH, extent, t])

  return <canvas ref={canvasRef} style={{ width: W, height: H }} className="footprint-preview" />
}
