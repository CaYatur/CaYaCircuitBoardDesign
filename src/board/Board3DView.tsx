// ─── 3B Görünüm (Kart + Bileşenler) ───────────────────────────────────────
// Kartı ve bileşenleri gerçek zamanlı, döndürülebilir 3B önizleme olarak çizer.
//   • Sürükle: yörüngede döndür (orbit)
//   • Tekerlek: yakınlaştır/uzaklaştır
//   • Sağ tık sürükle / Boşluk+sürükle: kaydır (pan)
//   • Üst / Alt bakış, PCB rengi ve katman görünürlüğü seçenekleri

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { render3D, fit3DCamera, type Camera } from '../render/render3d'
import { loadModelFromFile, pickModelFile } from '../io/model3d'
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
  const t = useT()

  const [showComponents, setShowComponents] = useState(true)
  const [showTraces, setShowTraces] = useState(true)
  const [showModels, setShowModels] = useState(true)
  const [showPanel, setShowPanel] = useState(false)
  const [busy, setBusy] = useState(false)

  const importModel = async () => {
    try {
      const file = await pickModelFile()
      if (!file) return
      setBusy(true)
      const model = await loadModelFromFile(file, project.board)
      addModel3D(model)
      setShowPanel(true)
      setStatus(t('3B model içe aktarıldı: {name}', { name: model.name }))
    } catch (err: any) {
      setStatus(t('3B model içe aktarılamadı: {err}', { err: err?.message ?? err }))
    } finally {
      setBusy(false)
    }
  }
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
      showComponents,
      showTraces,
      showModels
    })
  })

  // ── Fare ──
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || (e.button === 0 && spaceHeld.current)) {
      drag.current = { mode: 'pan', x: e.clientX, y: e.clientY }
    } else if (e.button === 0) {
      drag.current = { mode: 'orbit', x: e.clientX, y: e.clientY }
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
  const onMouseUp = () => { drag.current.mode = 'none' }
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

  const setView = (kind: 'iso' | 'top' | 'bottom' | 'front') => {
    const base = fit3DCamera(project)
    if (kind === 'top') { base.pitch = -Math.PI / 2 + 0.06; base.yaw = -Math.PI / 2 }
    else if (kind === 'bottom') { base.pitch = Math.PI / 2 - 0.06; base.yaw = -Math.PI / 2 }
    else if (kind === 'front') { base.pitch = -0.08; base.yaw = -Math.PI / 2 }
    camRef.current = base
    redraw()
  }

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
        <button onClick={() => setView('iso')} title={t('İzometrik görünüm')}>⬢ {t('İzometrik')}</button>
        <button onClick={() => setView('top')} title={t('Üstten görünüm')}>▤ {t('Üst')}</button>
        <button onClick={() => setView('bottom')} title={t('Alttan görünüm')}>▥ {t('Alt')}</button>
        <button onClick={() => setView('front')} title={t('Önden görünüm')}>▬ {t('Ön')}</button>
        <span className="board-sep" />
        <label className="board-check">
          <input type="checkbox" checked={showComponents} onChange={(e) => { setShowComponents(e.target.checked); redraw() }} />
          {t('Bileşenler')}
        </label>
        <label className="board-check">
          <input type="checkbox" checked={showTraces} onChange={(e) => { setShowTraces(e.target.checked); redraw() }} />
          {t('İzler')}
        </label>
        {models.length > 0 && (
          <label className="board-check">
            <input type="checkbox" checked={showModels} onChange={(e) => { setShowModels(e.target.checked); redraw() }} />
            {t('Modeller')}
          </label>
        )}
        <span className="board-sep" />
        <button disabled={busy} onClick={importModel} title={t('OBJ/STL 3B model içe aktar')}>
          ＋ {t('3D Model')}
        </button>
        {models.length > 0 && (
          <button className={showPanel ? 'active' : ''} onClick={() => setShowPanel((v) => !v)}>
            ⚙ {t('Modeller')} ({models.length})
          </button>
        )}
        <span className="board-hint">
          {t('Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık/Boşluk+sürükle: kaydır')}
        </span>
      </div>

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
