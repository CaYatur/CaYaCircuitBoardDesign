// ─── 3B Görünüm (Kart + Bileşenler) ───────────────────────────────────────
// Kartı ve bileşenleri gerçek zamanlı, döndürülebilir 3B önizleme olarak çizer.
//   • Sürükle: yörüngede döndür (orbit)
//   • Tekerlek: yakınlaştır/uzaklaştır
//   • Sağ tık sürükle / Boşluk+sürükle: kaydır (pan)
// Araçlar (görünümler, katman anahtarları, içe/dışa aktarma) sol araç
// şeridindedir (EditorToolStrip) — tüm modlarla aynı sabit konum.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { render3D, fit3DCamera, screenToBoardPoint, type Camera } from '../render/render3d'
import { hitTest } from '../editor/hittest'
import { emptySelection } from '../types'
import { loadModelFromFile, pickModelFile } from '../io/model3d'
import { exportSceneObj } from '../io/scene3d'
import { downloadBlob, saveTextFile } from '../io/files'
import { useT } from '../i18n'

export function Board3DView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const models = useStore((s) => s.project.models3d ?? [])
  const addModel3D = useStore((s) => s.addModel3D)
  const updateModel3D = useStore((s) => s.updateModel3D)
  const removeModel3D = useStore((s) => s.removeModel3D)
  const setStatus = useStore((s) => s.setStatus)
  const opts = useStore((s) => s.view3dOpts)
  const request = useStore((s) => s.view3dRequest)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)
  const clearSelection = useStore((s) => s.clearSelection)
  const t = useT()

  const [showPanel, setShowPanel] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [busy, setBusy] = useState(false)

  const importModel = useCallback(async () => {
    try {
      const file = await pickModelFile()
      if (!file) return
      setBusy(true)
      const model = await loadModelFromFile(file, useStore.getState().project.board)
      addModel3D(model)
      setShowPanel(true)
      setStatus(t('3B model içe aktarıldı: {name}', { name: model.name }))
    } catch (err: any) {
      setStatus(t('3B model içe aktarılamadı: {err}', { err: err?.message ?? err }))
    } finally {
      setBusy(false)
    }
  }, [addModel3D, setStatus, t])
  const camRef = useRef<Camera>(fit3DCamera(project))
  const [, setTick] = useState(0)
  const redraw = useCallback(() => setTick((n) => n + 1), [])

  const drag = useRef<{ mode: 'none' | 'orbit' | 'pan'; x: number; y: number }>({ mode: 'none', x: 0, y: 0 })
  const spaceHeld = useRef(false)
  const fitted = useRef(false)

  // ── Boyutlandırma ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    obs.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  // ── İlk açılışta sığdır ──
  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      camRef.current = fit3DCamera(project)
      fitted.current = true
      redraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const setView = useCallback(
    (kind: 'iso' | 'top' | 'bottom' | 'front') => {
      const base = fit3DCamera(useStore.getState().project)
      if (kind === 'top') { base.pitch = -Math.PI / 2 + 0.06; base.yaw = -Math.PI / 2 }
      else if (kind === 'bottom') { base.pitch = Math.PI / 2 - 0.06; base.yaw = -Math.PI / 2 }
      else if (kind === 'front') { base.pitch = -0.08; base.yaw = -Math.PI / 2 }
      camRef.current = base
      redraw()
    },
    [redraw]
  )

  /** Geçerli görünümü yüksek çözünürlüklü PNG olarak indir */
  const exportPng = useCallback(() => {
    const st = useStore.getState()
    const scale = 2
    const off = document.createElement('canvas')
    off.width = size.w * scale
    off.height = size.h * scale
    const ctx = off.getContext('2d')!
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    render3D(ctx, {
      project: st.project,
      getFootprint: st.getFootprint,
      camera: camRef.current,
      width: size.w,
      height: size.h,
      showComponents: st.view3dOpts.showComponents,
      showTraces: st.view3dOpts.showTraces,
      showModels: st.view3dOpts.showModels,
      showPinLabels: st.view3dOpts.showPinLabels
    })
    off.toBlob((blob) => {
      if (!blob) return
      const safe = (st.project.name || 'kart').replace(/[^\w\-]+/g, '_')
      downloadBlob(`${safe}_3d.png`, blob)
      setStatus(t('3B görünüm PNG olarak dışa aktarıldı'))
    }, 'image/png')
  }, [size, setStatus, t])

  /** Sahneyi OBJ + MTL modeli olarak indir */
  const exportObj = useCallback(async () => {
    const st = useStore.getState()
    try {
      const { obj, mtl, mtlName } = exportSceneObj(st.project, st.getFootprint, st.view3dOpts)
      const safe = (st.project.name || 'kart').replace(/[^\w\-]+/g, '_')
      const okObj = await saveTextFile(`${safe}_3d.obj`, obj, 'model/obj')
      if (okObj) await saveTextFile(mtlName, mtl, 'model/mtl')
      setStatus(t('3B sahne OBJ + MTL olarak dışa aktarıldı'))
    } catch (err: any) {
      setStatus(t('Dışa aktarılamadı: {err}', { err: err?.message ?? err }))
    }
  }, [setStatus, t])

  // ── Sol şeritten gelen komutlar ──
  useEffect(() => {
    if (!request) return
    useStore.setState({ view3dRequest: null })
    if (request.kind === 'view') setView(request.v)
    else if (request.kind === 'import-model') void importModel()
    else if (request.kind === 'export-png') exportPng()
    else if (request.kind === 'export-obj') void exportObj()
  }, [request, setView, importModel, exportPng, exportObj])

  // ── Render ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render3D(ctx, {
      project,
      getFootprint,
      camera: camRef.current,
      width: size.w,
      height: size.h,
      showComponents: opts.showComponents,
      showTraces: opts.showTraces,
      showModels: opts.showModels,
      showPinLabels: opts.showPinLabels,
      onImageLoad: redraw,
      selectedComponentIds: selection.componentIds
    })
  })

  // ── Fare ──
  const clickStart = useRef<{ x: number; y: number } | null>(null)
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || (e.button === 0 && spaceHeld.current)) {
      drag.current = { mode: 'pan', x: e.clientX, y: e.clientY }
    } else if (e.button === 0) {
      drag.current = { mode: 'orbit', x: e.clientX, y: e.clientY }
      clickStart.current = { x: e.clientX, y: e.clientY }
    }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current
    if (d.mode === 'none') return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    const cam = camRef.current
    if (d.mode === 'orbit') {
      cam.yaw += dx * 0.01
      cam.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, cam.pitch - dy * 0.01))
    } else {
      // pan — kamera hedefini ekran düzleminde kaydır
      const panScale = cam.dist * 0.0016
      const cosY = Math.cos(cam.yaw)
      const sinY = Math.sin(cam.yaw)
      // ekran-sağ ≈ dünya (sinY, -cosY); ekran-yukarı hedefi z + xy karışımı
      cam.target.x -= (dx * -sinY) * panScale
      cam.target.y -= (dx * cosY) * panScale
      cam.target.z += dy * panScale
    }
    redraw()
  }
  const onMouseUp = (e: React.MouseEvent) => {
    const cs = clickStart.current
    clickStart.current = null
    const wasOrbit = drag.current.mode === 'orbit'
    drag.current.mode = 'none'
    if (!wasOrbit || !cs) return
    // Sürüklenmeden (orbit yapılmadan) bırakıldıysa bu bir TIKLAMA — seçim yap
    if (Math.hypot(e.clientX - cs.x, e.clientY - cs.y) > 4) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ray = screenToBoardPoint(camRef.current, size.w, size.h, e.clientX - rect.left, e.clientY - rect.top)
    if (!ray) return
    const tol = Math.max(0.15, ray.pixelToMm * 6)
    const hit = hitTest(project, getFootprint, ray.point, tol)
    if (!hit) { clearSelection(); return }
    const sel = emptySelection()
    if (hit.type === 'component') sel.componentIds = [hit.id]
    else if (hit.type === 'pad') sel.componentIds = [hit.componentId]
    else if (hit.type === 'via') sel.viaIds = [hit.id]
    else if (hit.type === 'trace') sel.traceIds = [hit.id]
    else if (hit.type === 'text') sel.textIds = [hit.id]
    else if (hit.type === 'zone') sel.zoneIds = [hit.id]
    else if (hit.type === 'image') sel.imageIds = [hit.id]
    setSelection(sel)
    redraw()
  }
  const onWheel = (e: React.WheelEvent) => {
    const cam = camRef.current
    cam.dist = Math.max(8, Math.min(2000, cam.dist * Math.exp(e.deltaY * 0.0012)))
    redraw()
  }

  // ── Klavye (boşluk = pan) ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tg.tagName)) return
      if (e.key === ' ') { spaceHeld.current = true; e.preventDefault() }
    }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') spaceHeld.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  /** Bileşen 3B rengini güncelle (undo kirletmez) */
  const setComponentColor = (id: string, color: string | null) => {
    useStore.getState().updateSettings((p) => {
      const c = p.components.find((x) => x.id === id)
      if (c) {
        if (color) c.color3d = color
        else delete c.color3d
      }
    })
  }

  /** Seçili nesnenin araç çubuğunda gösterilecek kısa etiketi */
  const selectionLabel = (() => {
    if (selection.componentIds.length > 0) {
      const c = project.components.find((x) => x.id === selection.componentIds[0])
      return c ? c.refDes : null
    }
    if (selection.traceIds.length > 0) return t('İz')
    if (selection.viaIds.length > 0) return 'Via'
    if (selection.textIds.length > 0) return t('Yazı')
    if (selection.imageIds.length > 0) return t('Görsel')
    if (selection.zoneIds.length > 0) return t('Bakır alan')
    return null
  })()

  return (
    <div className="canvas-container view3d-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: 'block', cursor: 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="board-toolbar view3d-toolbar">
        {project.components.length > 0 && (
          <button className={showColors ? 'active' : ''} onClick={() => setShowColors((v) => !v)} title={t('Bileşen renklerini ayrı ayrı değiştir')}>
            🎨 {t('Renkler')}
          </button>
        )}
        {models.length > 0 && (
          <button className={showPanel ? 'active' : ''} onClick={() => setShowPanel((v) => !v)} disabled={busy}>
            ⚙ {t('Modeller')} ({models.length})
          </button>
        )}
        {selectionLabel && (
          <button onClick={() => clearSelection()} title={t('Seçimi temizle')}>
            ✓ {selectionLabel} ✕
          </button>
        )}
        <span className="board-hint">
          {t('Tıkla: seç · Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık/Boşluk+sürükle: kaydır')}
        </span>
      </div>

      {showColors && project.components.length > 0 && (
        <div className="model3d-panel comp3d-panel">
          <div className="model3d-panel-head">
            <h4>🎨 {t('Bileşen renkleri')}</h4>
            <button onClick={() => setShowColors(false)}>✕</button>
          </div>
          <div className="model3d-list">
            {project.components.map((c) => {
              const fp = getFootprint(c.footprintId)
              return (
                <div key={c.id} className="comp3d-row">
                  <span className="comp3d-ref">{c.refDes}</span>
                  <span className="comp3d-name" title={fp?.name}>{fp?.name ?? c.footprintId}</span>
                  <input
                    type="color"
                    value={c.color3d ?? '#4a6e50'}
                    onChange={(e) => setComponentColor(c.id, e.target.value)}
                    title={t('Renk')}
                  />
                  {c.color3d && (
                    <button
                      className="model3d-del"
                      onClick={() => setComponentColor(c.id, null)}
                      title={t('Varsayılan renge dön')}
                    >↺</button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="model3d-hint">{t('Renk, footprint 3B modelinin/otomatik gövdenin rengini geçersiz kılar. PNG/OBJ dışa aktarımına yansır.')}</p>
        </div>
      )}

      {showPanel && models.length > 0 && (
        <div className="model3d-panel">
          <div className="model3d-panel-head">
            <h4>⬢ {t('3B Modeller')}</h4>
            <button onClick={() => setShowPanel(false)}>✕</button>
          </div>
          <div className="model3d-list">
            {models.map((m) => (
              <div key={m.id} className="model3d-item">
                <div className="model3d-item-head">
                  <label className="board-check">
                    <input
                      type="checkbox"
                      checked={m.visible !== false}
                      onChange={(e) => updateModel3D(m.id, { visible: e.target.checked })}
                    />
                    <span className="model3d-name" title={m.name}>{m.name}</span>
                  </label>
                  <input
                    type="color"
                    value={m.color}
                    onChange={(e) => updateModel3D(m.id, { color: e.target.value })}
                    title={t('Renk')}
                  />
                  <button className="model3d-del" onClick={() => removeModel3D(m.id)} title={t('Sil')}>🗑</button>
                </div>
                <ModelSlider label={t('Ölçek')} value={m.scale} min={0.01} max={20} step={0.01}
                  onChange={(v) => updateModel3D(m.id, { scale: v })} />
                <ModelSlider label={t('Dönüş (Z°)')} value={m.rotZ} min={0} max={360} step={1}
                  onChange={(v) => updateModel3D(m.id, { rotZ: v })} />
                <div className="model3d-xyz">
                  <NumField label="X" value={m.x} step={0.5} onChange={(v) => updateModel3D(m.id, { x: v })} />
                  <NumField label="Y" value={m.y} step={0.5} onChange={(v) => updateModel3D(m.id, { y: v })} />
                  <NumField label="Z" value={m.z} step={0.5} onChange={(v) => updateModel3D(m.id, { z: v })} />
                </div>
              </div>
            ))}
          </div>
          <p className="model3d-hint">{t('OBJ ve STL desteklenir. Model kartın üstüne oturur; ölçek/dönüş/konumu ayarlayın.')}</p>
        </div>
      )}
    </div>
  )
}

function ModelSlider({
  label, value, min, max, step, onChange
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div className="model3d-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      <input type="number" min={min} max={max} step={step} value={+value.toFixed(2)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  )
}

function NumField({
  label, value, step, onChange
}: {
  label: string; value: number; step: number; onChange: (v: number) => void
}) {
  return (
    <label className="model3d-num">
      <span>{label}</span>
      <input type="number" step={step} value={+value.toFixed(2)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  )
}
