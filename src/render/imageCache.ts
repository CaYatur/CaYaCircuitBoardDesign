// ─── Görsel (raster/vektör) önbelleği ─────────────────────────────────────
// Karta yerleştirilen PNG/SVG görselleri HTMLImageElement olarak yükleyip
// önbelleğe alır. Yükleme tamamlanınca kaydırılan `onLoad` çağrısı editörün
// yeniden çizmesini tetikler (görsel data URL değişmedikçe tekrar yüklenmez).

interface Entry {
  img: HTMLImageElement
  loaded: boolean
  failed: boolean
}

const cache = new Map<string, Entry>()

/** Yüklüyse görseli döndür; değilse yüklemeyi başlatıp null döndür. */
export function getCachedImage(src: string, onLoad: () => void): HTMLImageElement | null {
  let e = cache.get(src)
  if (!e) {
    const img = new Image()
    e = { img, loaded: false, failed: false }
    cache.set(src, e)
    img.onload = () => {
      e!.loaded = true
      onLoad()
    }
    img.onerror = () => {
      e!.failed = true // yeniden denemeyi önle
    }
    img.src = src
  }
  return e.loaded ? e.img : null
}

/** Bir görselin doğal en/boy oranı (yüklüyse), yoksa null */
export function imageAspect(src: string): number | null {
  const e = cache.get(src)
  if (e && e.loaded && e.img.naturalHeight > 0) {
    return e.img.naturalWidth / e.img.naturalHeight
  }
  return null
}
