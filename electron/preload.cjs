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
  /** Masaüstü uygulaması mı (özellik algılama) */
  isDesktop: true
})
