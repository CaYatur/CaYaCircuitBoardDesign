// ─── Alt durum çubuğu ─────────────────────────────────────────────────────

import { useStore } from '../state/store'
import { useT } from '../i18n'

export function StatusBar() {
  const message = useStore((s) => s.statusMessage)
  const tool = useStore((s) => s.tool)
  const mode = useStore((s) => s.mode)
  const activeLayer = useStore((s) => s.activeLayer)
  const project = useStore((s) => s.project)
  const t = useT()

  const toolNames: Record<string, string> = {
    select: t('Seç'),
    trace: t('İz'),
    via: 'Via',
    text: t('Yazı'),
    zone: t('Alan'),
    measure: t('Ölçüm'),
    net: t('Net'),
    delete: t('Sil'),
    'board-shape': t('Kart Çizimi')
  }

  return (
    <div className="status-bar">
      <span className="status-msg">{message}</span>
      <span className="status-right">
        {mode === 'pcb' && (
          <>
            <span className="status-chip">{toolNames[tool] ?? tool}</span>
            <span className={`status-chip layer-${activeLayer}`}>
              {activeLayer === 'top' ? '▲ ' + t('Üst') : '▼ ' + t('Alt')}
            </span>
          </>
        )}
        <span className="status-chip">
          {project.board.width}×{project.board.height} mm ·{' '}
          {project.board.layerCount === 1 ? t('1 katman') : t('2 katman')}
        </span>
        <span className="status-chip">
          {t('{c} komp · {t} iz · {v} via', {
            c: project.components.length,
            t: project.traces.length,
            v: project.vias.length
          })}
        </span>
        <a
          className="status-chip brand-link"
          href="https://cayadev.com"
          target="_blank"
          rel="noreferrer"
          title="CaYaDev"
        >
          CaYaDev · cayadev.com
        </a>
      </span>
    </div>
  )
}
