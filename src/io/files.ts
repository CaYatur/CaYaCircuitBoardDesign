// ─── Dosya kaydetme/açma yardımcıları ─────────────────────────────────────
// Masaüstü: Electron yerel diyalog (macOS'ta File System Access API kilitlenme
// sorunu yaşanmaz). Web: File System Access API (konum seçtirir), yoksa indirme.

import { native, toTransferable } from './native'

export async function saveTextFile(
  filename: string,
  content: string,
  mime = 'text/plain'
): Promise<boolean> {
  // Masaüstü: yerel kaydetme diyalogu (güvenilir, macOS'ta kilitlenmez)
  const n = native()
  if (n) {
    const ext = filename.slice(filename.lastIndexOf('.') + 1)
    const res = await n.exportFile({ defaultName: filename, content, ext })
    if (res.error) throw new Error(res.error)
    return !!res.path
  }
  const w = window as any
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const ext = filename.slice(filename.lastIndexOf('.'))
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Dosya', accept: { [mime]: [ext] } }]
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch (err: any) {
      if (err?.name === 'AbortError') return false
      // API başarısız — indirme yöntemine düş
    }
  }
  downloadBlob(filename, new Blob([content], { type: mime }))
  return true
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Dosya seçtirip içeriğini metin olarak döndürür */
export function pickTextFile(accept: string): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const content = await file.text()
      resolve({ name: file.name, content })
    }
    // İptal edilirse (focus geri gelir ve change tetiklenmez) null döner
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export interface PickedImage {
  format: 'png' | 'svg'
  /** data URL (raster için readAsDataURL, SVG için base64 kodlanmış) */
  src: string
  /** doğal en/boy oranı (bulunamazsa 1) */
  aspect: number
}

/** Kullanıcıdan PNG/JPG/SVG seçtirir; data URL + en-boy oranı döndürür */
export function pickImageFile(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name)
      let src: string
      if (isSvg) {
        const text = await file.text()
        src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)))
      } else {
        src = await new Promise<string>((res, rej) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result as string)
          fr.onerror = rej
          fr.readAsDataURL(file)
        })
      }
      const aspect = await new Promise<number>((res) => {
        const img = new Image()
        img.onload = () =>
          res(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1)
        img.onerror = () => res(1)
        img.src = src
      })
      resolve({ format: isSvg ? 'svg' : 'png', src, aspect })
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export interface ExportFile {
  name: string
  content: string | Blob
  mime?: string
}

/** Birden çok dosyayı tek seferde indirmek yerine ZIP olmadan sıralı indirme */
export async function saveMultipleFiles(files: ExportFile[]): Promise<void> {
  for (const f of files) {
    const blob =
      f.content instanceof Blob ? f.content : new Blob([f.content], { type: f.mime ?? 'text/plain' })
    downloadBlob(f.name, blob)
    // Tarayıcının indirmeleri engellememesi için küçük gecikme
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * Birden çok dosyayı tek seferde SEÇİLEN BİR KLASÖRE yazar (File System Access
 * API — showDirectoryPicker). API yoksa sıralı indirmeye düşer.
 * Döndürdüğü sayı yazılan dosya adedidir (0 = kullanıcı iptal etti).
 */
export async function saveFilesToDirectory(files: ExportFile[]): Promise<number> {
  // Masaüstü: yerel klasör seçme diyalogu (macOS'ta kilitlenmez)
  const n = native()
  if (n) {
    const payload = await Promise.all(
      files.map(async (f) => ({ name: f.name, content: await toTransferable(f.content) }))
    )
    const res = await n.exportToDir({ files: payload })
    if (res.error) throw new Error(res.error)
    return res.count ?? 0
  }
  const w = window as any
  if (typeof w.showDirectoryPicker === 'function') {
    try {
      const dir = await w.showDirectoryPicker({ mode: 'readwrite' })
      for (const f of files) {
        const handle = await dir.getFileHandle(f.name, { create: true })
        const writable = await handle.createWritable()
        const blob =
          f.content instanceof Blob
            ? f.content
            : new Blob([f.content], { type: f.mime ?? 'text/plain' })
        await writable.write(blob)
        await writable.close()
      }
      return files.length
    } catch (err: any) {
      if (err?.name === 'AbortError') return 0
      // API başarısız — sıralı indirmeye düş
    }
  }
  await saveMultipleFiles(files)
  return files.length
}
