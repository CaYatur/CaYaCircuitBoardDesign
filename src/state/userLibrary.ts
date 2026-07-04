// ─── Kullanıcı komponent kütüphanesi (global, otomatik kalıcı) ─────────────
// Kullanıcının oluşturduğu footprint'ler projeden BAĞIMSIZ olarak burada
// tutulur ve otomatik kaydedilir ("Kaydet" demeye gerek yok):
//   • Masaüstü (Electron): userData klasöründe caya-library.json (preload IPC).
//   • Web/tarayıcı: localStorage (Mac & Windows uyumlu, otomatik).
// Kategoriler kullanıcı tarafından düzenlenebilir; footprint.category alanı
// hangi kategoriye ait olduğunu belirler.

import { create } from 'zustand'
import type { Footprint } from '../types'
import { validateFootprint } from '../io/project'

const LS_KEY = 'caya-user-library-v1'

interface NativeBridge {
  saveLibrary?: (data: string) => Promise<boolean>
  loadLibrary?: () => Promise<string | null>
  libraryPath?: () => Promise<string | null>
}

const native = (): NativeBridge | undefined => (window as any).cayaNative

interface LibraryPayload {
  version: 1
  footprints: Footprint[]
  categories: string[]
}

export interface UserLibraryState {
  footprints: Footprint[]
  /** Kullanıcı tanımlı kategoriler (footprint kategorilerine ek olarak boşlar da kalır) */
  categories: string[]
  loaded: boolean
  /** Masaüstünde kütüphane dosyasının yolu (bilgi amaçlı) */
  storagePath: string | null

  load: () => Promise<void>
  /** Footprint ekle/güncelle (id eşleşirse güncellenir) */
  saveFootprint: (fp: Footprint) => void
  removeFootprint: (id: string) => void
  /** Toplu içe aktarım (mevcutlarla birleştirir) */
  importFootprints: (fps: Footprint[]) => number
  addCategory: (name: string) => void
  removeCategory: (name: string) => void
  renameCategory: (from: string, to: string) => void
  /** Bir footprint'i başka kategoriye taşı */
  moveToCategory: (id: string, category: string) => void
}

const DEFAULT_CATEGORIES = ['Genel', 'Modüller', 'Konnektörler', 'Güç']

let saveTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(get: () => UserLibraryState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const s = get()
    const payload: LibraryPayload = {
      version: 1,
      footprints: s.footprints,
      categories: s.categories
    }
    const data = JSON.stringify(payload)
    const n = native()
    if (n?.saveLibrary) {
      n.saveLibrary(data).catch(() => {
        /* IPC başarısızsa localStorage yine de yazılır */
      })
    }
    try {
      localStorage.setItem(LS_KEY, data)
    } catch {
      /* localStorage yoksa/dolu ise yoksay */
    }
  }, 350)
}

/** Kategori listesini footprint'lerdekiyle birleştirip benzersizleştir */
function mergeCategories(base: string[], fps: Footprint[]): string[] {
  const set = new Set<string>(base)
  for (const f of fps) if (f.category) set.add(f.category)
  return [...set]
}

export const useUserLibrary = create<UserLibraryState>((set, get) => ({
  footprints: [],
  categories: [...DEFAULT_CATEGORIES],
  loaded: false,
  storagePath: null,

  load: async () => {
    let raw: string | null = null
    const n = native()
    if (n?.loadLibrary) {
      try {
        raw = await n.loadLibrary()
      } catch {
        raw = null
      }
      if (n.libraryPath) {
        try {
          const p = await n.libraryPath()
          if (p) set({ storagePath: p })
        } catch {
          /* yoksay */
        }
      }
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(LS_KEY)
      } catch {
        raw = null
      }
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LibraryPayload | Footprint[]
        const fpsRaw = Array.isArray(parsed) ? parsed : parsed.footprints
        const cats = Array.isArray(parsed) ? [] : parsed.categories ?? []
        const footprints = (Array.isArray(fpsRaw) ? fpsRaw : [])
          .map((f) => {
            try {
              return validateFootprint(f)
            } catch {
              return null
            }
          })
          .filter((f): f is Footprint => f !== null)
        set({
          footprints,
          categories: mergeCategories(cats.length ? cats : DEFAULT_CATEGORIES, footprints),
          loaded: true
        })
        return
      } catch {
        /* bozuk veri — boş başla */
      }
    }
    set({ loaded: true })
  },

  saveFootprint: (fp) => {
    set((s) => {
      const idx = s.footprints.findIndex((f) => f.id === fp.id)
      const footprints =
        idx >= 0
          ? s.footprints.map((f, i) => (i === idx ? fp : f))
          : [...s.footprints, fp]
      return { footprints, categories: mergeCategories(s.categories, footprints) }
    })
    schedulePersist(get)
  },

  removeFootprint: (id) => {
    set((s) => ({ footprints: s.footprints.filter((f) => f.id !== id) }))
    schedulePersist(get)
  },

  importFootprints: (fps) => {
    let count = 0
    set((s) => {
      const map = new Map(s.footprints.map((f) => [f.id, f]))
      for (const fp of fps) {
        map.set(fp.id, { ...fp, custom: true })
        count++
      }
      const footprints = [...map.values()]
      return { footprints, categories: mergeCategories(s.categories, footprints) }
    })
    schedulePersist(get)
    return count
  },

  addCategory: (name) => {
    const n = name.trim()
    if (!n) return
    set((s) => (s.categories.includes(n) ? {} : { categories: [...s.categories, n] }))
    schedulePersist(get)
  },

  removeCategory: (name) => {
    set((s) => ({
      categories: s.categories.filter((c) => c !== name),
      // O kategorideki footprint'leri "Genel"e taşı
      footprints: s.footprints.map((f) =>
        f.category === name ? { ...f, category: 'Genel' } : f
      )
    }))
    schedulePersist(get)
  },

  renameCategory: (from, to) => {
    const t = to.trim()
    if (!t) return
    set((s) => ({
      categories: s.categories.map((c) => (c === from ? t : c)),
      footprints: s.footprints.map((f) => (f.category === from ? { ...f, category: t } : f))
    }))
    schedulePersist(get)
  },

  moveToCategory: (id, category) => {
    set((s) => ({
      footprints: s.footprints.map((f) => (f.id === id ? { ...f, category } : f)),
      categories: s.categories.includes(category) ? s.categories : [...s.categories, category]
    }))
    schedulePersist(get)
  }
}))
