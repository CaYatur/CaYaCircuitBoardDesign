// ─── 3B Görünüm (Kart + Bileşenler) ───────────────────────────────────────
// Kartı ve bileşenleri gerçek zamanlı, döndürülebilir 3B önizleme olarak çizer.
//   • Sürükle: yörüngede döndür (orbit)
//   • Tekerlek: yakınlaştır/uzaklaştır
//   • Sağ tık sürükle / Boşluk+sürükle: kaydır (pan)
//   • Üst / Alt bakış, PCB rengi ve katman görünürlüğü seçenekleri

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { render3D, fit3DCamera, type Camera } from '../render/render3d'
import { useT } from '../i18n'

export function Board3DView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const project = useStore((s) => s.project)
  const getFootprint = useStore((s) => s.getFootprint)
  const t = useT()

  const [showComponents, setShowComponents] = useState(true)
  const [showTraces, setShowTraces] = useState(true)
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
      showTraces
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
        <span className="board-hint">
          {t('Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık/Boşluk+sürükle: kaydır')}
        </span>
      </div>
    </div>
  )
}
