// ─── Sabit sol araç şeridi ────────────────────────────────────────────────
// Tüm modlarda (Şema, PCB, Kart Editörü, 3B Görünüm) araçlar HEP aynı yerde:
// editör alanının sol kenarındaki bu dikey şeritte. Mod değişince şeridin
// içeriği değişir ama konumu ve düzeni sabittir (erişilebilirlik).

import { useStore } from '../state/store'
import type { ToolId } from '../types'
import { useT } from '../i18n'
import { Icon, type IconName } from './Icon'

const PCB_TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Seç', key: 'S' },
  { id: 'trace', icon: 'trace', label: 'İz', key: 'T' },
  { id: 'via', icon: 'via', label: 'Via', key: 'V' },
  { id: 'zone', icon: 'zone', label: 'Alan', key: '' },
  { id: 'text', icon: 'text', label: 'Yazı', key: '' },
  { id: 'net', icon: 'net', label: 'Net', key: 'N' },
  { id: 'measure', icon: 'measure', label: 'Ölçüm', key: 'M' },
  { id: 'delete', icon: 'trash', label: 'Sil', key: '' }
]

const SCH_TOOLS: { id: 'select' | 'wire' | 'net' | 'delete'; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Seç', key: 'S' },
  { id: 'wire', icon: 'wire', label: 'Tel', key: 'W' },
  { id: 'net', icon: 'net', label: 'Net', key: 'N' },
  { id: 'delete', icon: 'trash', label: 'Sil', key: '' }
]

const BOARD_TOOLS: { id: 'select' | 'add-rect' | 'add-circle'; icon: IconName; label: string }[] = [
  { id: 'select', icon: 'select', label: 'Seç' },
  { id: 'add-rect', icon: 'board', label: 'Kesim ▭' },
  { id: 'add-circle', icon: 'via', label: 'Kesim ◯' }
]

export function EditorToolStrip() {
  const mode = useStore((s) => s.mode)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const schTool = useStore((s) => s.schTool)
  const setSchTool = useStore((s) => s.setSchTool)
  const boardTool = useStore((s) => s.boardTool)
  const setBoardTool = useStore((s) => s.setBoardTool)
  const view3dOpts = useStore((s) => s.view3dOpts)
  const setView3dOpts = useStore((s) => s.setView3dOpts)
  const requestView3d = useStore((s) => s.requestView3d)
  const t = useT()

  return (
    <div className="tool-strip">
      {mode === 'pcb' &&
        PCB_TOOLS.map((tl) => (
          <button
            key={tl.id}
            className={'strip-btn' + (tool === tl.id ? ' active' : '')}
            title={`${t(tl.label)}${tl.key ? ` (${tl.key})` : ''}`}
            onClick={() => setTool(tl.id)}
          >
            <span className="strip-icon"><Icon name={tl.icon} size={19} /></span>
            <span className="strip-label">{t(tl.label)}</span>
          </button>
        ))}

      {mode === 'schematic' &&
        SCH_TOOLS.map((tl) => (
          <button
            key={tl.id}
            className={'strip-btn' + (schTool === tl.id ? ' active' : '')}
            title={`${t(tl.label)}${tl.key ? ` (${tl.key})` : ''}`}
            onClick={() => setSchTool(tl.id)}
          >
            <span className="strip-icon"><Icon name={tl.icon} size={19} /></span>
            <span className="strip-label">{t(tl.label)}</span>
          </button>
        ))}

      {mode === 'board' &&
        BOARD_TOOLS.map((tl) => (
          <button
            key={tl.id}
            className={'strip-btn' + (boardTool === tl.id ? ' active' : '')}
            title={t(tl.label)}
            onClick={() => setBoardTool(tl.id)}
          >
            <span className="strip-icon"><Icon name={tl.icon} size={19} /></span>
            <span className="strip-label">{t(tl.label)}</span>
          </button>
        ))}

      {mode === 'view3d' && (
        <>
          <button className="strip-btn" title={t('İzometrik görünüm')} onClick={() => requestView3d({ kind: 'view', v: 'iso' })}>
            <span className="strip-icon"><Icon name="cube" size={19} /></span>
            <span className="strip-label">{t('İzo')}</span>
          </button>
          <button className="strip-btn" title={t('Üstten görünüm')} onClick={() => requestView3d({ kind: 'view', v: 'top' })}>
            <span className="strip-icon"><Icon name="viewtop" size={19} /></span>
            <span className="strip-label">{t('Üst')}</span>
          </button>
          <button className="strip-btn" title={t('Alttan görünüm')} onClick={() => requestView3d({ kind: 'view', v: 'bottom' })}>
            <span className="strip-icon"><Icon name="viewbottom" size={19} /></span>
            <span className="strip-label">{t('Alt')}</span>
          </button>
          <button className="strip-btn" title={t('Önden görünüm')} onClick={() => requestView3d({ kind: 'view', v: 'front' })}>
            <span className="strip-icon"><Icon name="viewfront" size={19} /></span>
            <span className="strip-label">{t('Ön')}</span>
          </button>
          <div className="strip-sep" />
          <button
            className={'strip-btn' + (view3dOpts.showComponents ? ' active' : '')}
            title={t('Bileşenleri göster/gizle')}
            onClick={() => setView3dOpts({ showComponents: !view3dOpts.showComponents })}
          >
            <span className="strip-icon"><Icon name="chip" size={19} /></span>
            <span className="strip-label">{t('Bileşen')}</span>
          </button>
          <button
            className={'strip-btn' + (view3dOpts.showTraces ? ' active' : '')}
            title={t('İzleri göster/gizle')}
            onClick={() => setView3dOpts({ showTraces: !view3dOpts.showTraces })}
          >
            <span className="strip-icon"><Icon name="trace" size={19} /></span>
            <span className="strip-label">{t('İzler')}</span>
          </button>
          <button
            className={'strip-btn' + (view3dOpts.showModels ? ' active' : '')}
            title={t('İçe aktarılan 3B modelleri göster/gizle')}
            onClick={() => setView3dOpts({ showModels: !view3dOpts.showModels })}
          >
            <span className="strip-icon"><Icon name="cube" size={19} /></span>
            <span className="strip-label">{t('Model')}</span>
          </button>
          <button
            className={'strip-btn' + (view3dOpts.showPinLabels ? ' active' : '')}
            title={t('Pin adlarını kart üstünde göster')}
            onClick={() => setView3dOpts({ showPinLabels: !view3dOpts.showPinLabels })}
          >
            <span className="strip-icon"><Icon name="tag" size={19} /></span>
            <span className="strip-label">{t('Pin Adı')}</span>
          </button>
          <div className="strip-sep" />
          <button className="strip-btn" title={t('OBJ/STL 3B model içe aktar')} onClick={() => requestView3d({ kind: 'import-model' })}>
            <span className="strip-icon"><Icon name="plus" size={19} /></span>
            <span className="strip-label">{t('Model Al')}</span>
          </button>
          <button className="strip-btn" title={t('Görünümü PNG olarak dışa aktar')} onClick={() => requestView3d({ kind: 'export-png' })}>
            <span className="strip-icon"><Icon name="camera" size={19} /></span>
            <span className="strip-label">PNG</span>
          </button>
          <button className="strip-btn" title={t('Sahneyi OBJ modeli olarak dışa aktar')} onClick={() => requestView3d({ kind: 'export-obj' })}>
            <span className="strip-icon"><Icon name="export" size={19} /></span>
            <span className="strip-label">OBJ</span>
          </button>
        </>
      )}
    </div>
  )
}
