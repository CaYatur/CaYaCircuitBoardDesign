// ─── Son kullanılan projeler ──────────────────────────────────────────────
// Masaüstü: dosya yolları (Electron userData'da saklanır). Web: proje anlık
// görüntüleri (localStorage) — filesystem yolu olmadığı için JSON gömülür.

import { create } from 'zustand'
import { native } from '../io/native'

const WEB_KEY = 'caya-recents-v1'

export interface RecentEntry {
  name: string
  at: number
  /** Masaüstü: dosya yolu */
  path?: string
  /** Web: localStorage anlık görüntü kimliği */
  id?: string
}

interface WebRecent {
  id: string
  name: string
  at: number
  json: string
}

function loadWeb(): WebRecent[] {
  try {
    const raw = localStorage.getItem(WEB_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function saveWeb(list: WebRecent[]): void {
  try {
    localStorage.setItem(WEB_KEY, JSON.stringify(list))
  } catch {
    /* kota dolabilir — yoksay */
  }
}

interface RecentsStore {
  entries: RecentEntry[]
  /** Kaynaktan (native/localStorage) tazele */
  refresh: () => Promise<void>
  /** Web: proje anlık görüntüsü ekle */
  addWeb: (name: string, json: string) => void
  /** Web: kimliğe göre proje JSON'u */
  getWebJson: (id: string) => string | null
  /** Tümünü temizle */
  clear: () => Promise<void>
}

export const useRecents = create<RecentsStore>((set) => ({
  entries: [],
  refresh: async () => {
    const n = native()
    if (n) {
      try {
        const st = await n.getAppState()
        set({ entries: st.recents.map((r) => ({ name: r.name, at: r.at, path: r.path })) })
      } catch {
        set({ entries: [] })
      }
    } else {
      set({
        entries: loadWeb()
          .sort((a, b) => b.at - a.at)
          .map((r) => ({ name: r.name, at: r.at, id: r.id }))
      })
    }
  },
  addWeb: (name, json) => {
    const id = 'r' + Date.now().toString(36)
    const list = [
      { id, name, at: Date.now(), json },
      ...loadWeb().filter((r) => r.name !== name)
    ].slice(0, 6)
    saveWeb(list)
    set({ entries: list.map((r) => ({ name: r.name, at: r.at, id: r.id })) })
  },
  getWebJson: (id) => loadWeb().find((r) => r.id === id)?.json ?? null,
  clear: async () => {
    const n = native()
    if (n) {
      try {
        await n.clearRecents()
      } catch {
        /* yoksay */
      }
    } else {
      saveWeb([])
    }
    set({ entries: [] })
  }
}))
