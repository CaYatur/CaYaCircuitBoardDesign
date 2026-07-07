// ─── Preload: güvenli yerel köprü ─────────────────────────────────────────
// Renderer'a (web sayfası) yalnızca gerekli, güvenli fonksiyonları açar.
// Kullanıcı komponent kütüphanesi userData klasöründe kalıcı tutulur.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cayaNative', {
  /** Kütüphane JSON'unu userData klasörüne yazar */
  saveLibrary: (data) => ipcRenderer.invoke('caya:saveLibrary', data),
  /** Kütüphane JSON'unu okur (yoksa null) */
  loadLibrary: () => ipcRenderer.invoke('caya:loadLibrary'),
  /** Kütüphane dosyasının tam yolu (bilgi amaçlı) */
  libraryPath: () => ipcRenderer.invoke('caya:libraryPath'),

  // ── Uygulama durumu / son kullanılanlar ──
  getAppState: () => ipcRenderer.invoke('caya:getAppState'),
  clearRecents: () => ipcRenderer.invoke('caya:clearRecents'),

  // ── Proje kaydet/aç (yol hatırlar) ──
  /** { path?, defaultName, content, saveAs? } → { path } | { canceled } | { error } */
  saveProject: (arg) => ipcRenderer.invoke('caya:saveProject', arg),
  /** { path? } → { path, content } | { canceled } | { error } */
  openProject: (arg) => ipcRenderer.invoke('caya:openProject', arg),

  // ── Dışa aktarım (native diyalog, macOS kilitlenmez) ──
  /** { defaultName, content, ext } → { path } | { canceled } | { error } */
  exportFile: (arg) => ipcRenderer.invoke('caya:exportFile', arg),
  /** { files:[{name, content}] } → { dir, count } | { canceled } | { error } */
  exportToDir: (arg) => ipcRenderer.invoke('caya:exportToDir', arg),

  /** Masaüstü uygulaması mı (özellik algılama) */
  isDesktop: true
})
