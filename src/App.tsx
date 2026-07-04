// ─── Ana uygulama düzeni ──────────────────────────────────────────────────

import { useEffect } from 'react'
import { CanvasEditor } from './editor/CanvasEditor'
import { SchematicEditor } from './schematic/SchematicEditor'
import { BoardEditor } from './board/BoardEditor'
import { Toolbar } from './ui/Toolbar'
import { ToolSettingsBar } from './ui/ToolSettingsBar'
import { LayerPanel } from './ui/LayerPanel'
import { LibraryPanel } from './ui/LibraryPanel'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { StatusBar } from './ui/StatusBar'
import { DrcPanel } from './ui/DrcPanel'
import { CalculatorsDialog } from './ui/CalculatorsDialog'
import { ExportDialog } from './ui/ExportDialog'
import { FootprintEditor } from './ui/FootprintEditor'
import { BoardSettingsDialog } from './ui/BoardSettingsDialog'
import { SettingsDialog } from './ui/SettingsDialog'
import { AutorouteDialog } from './ui/AutorouteDialog'
import { PinEditorDialog } from './ui/PinEditorDialog'
import { PromptModal } from './ui/prompts'
import { useStore } from './state/store'
import { useUserLibrary } from './state/userLibrary'
import { t } from './i18n'

export default function App() {
  const mode = useStore((s) => s.mode)
  const dirty = useStore((s) => s.dirty)
  const warnOnUnsavedClose = useStore((s) => s.project.settings.warnOnUnsavedClose)

  // Kullanıcı komponent kütüphanesini bir kez yükle (otomatik kalıcı)
  useEffect(() => {
    if (!useUserLibrary.getState().loaded) useUserLibrary.getState().load()
  }, [])

  // Kaydedilmemiş değişiklik varken kapatmaya karşı uyarı.
  // Web: tarayıcı beforeunload istemi. Electron: main süreci window.__cayaDirty
  // bayrağını okuyup yerel bir onay penceresi gösterir.
  useEffect(() => {
    const active = dirty && warnOnUnsavedClose
    ;(window as any).__cayaDirty = active
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Bazı tarayıcılar returnValue'nun dolu olmasını ister
      e.returnValue = t('Kaydedilmemiş değişiklikler var. Yine de çıkmak istiyor musunuz?')
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, warnOnUnsavedClose])

  return (
    <div className="app">
      <Toolbar />
      {mode === 'pcb' && <ToolSettingsBar />}
      <div className="app-main">
        <aside className="sidebar-left">
          <LibraryPanel />
        </aside>
        <main className="editor-area">
          {mode === 'pcb' && <CanvasEditor />}
          {mode === 'schematic' && <SchematicEditor />}
          {mode === 'board' && <BoardEditor />}
          {mode === 'pcb' && <DrcPanel />}
        </main>
        <aside className="sidebar-right">
          {mode === 'pcb' && <LayerPanel />}
          <PropertiesPanel />
        </aside>
      </div>
      <StatusBar />

      {/* Dialoglar */}
      <CalculatorsDialog />
      <ExportDialog />
      <FootprintEditor />
      <BoardSettingsDialog />
      <SettingsDialog />
      <AutorouteDialog />
      <PinEditorDialog />
      <PromptModal />
    </div>
  )
}
