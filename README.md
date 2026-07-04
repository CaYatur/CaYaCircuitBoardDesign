# CaYa PCB Studio

Kapsamlı, çift katmanlı devre kartı (PCB) tasarım uygulaması — **macOS, Windows ve Web**.

**Geliştirici:** CaYaDev · [cayadev.com](https://cayadev.com)

![Electron](https://img.shields.io/badge/Electron-33-47848F) ![React](https://img.shields.io/badge/React-18-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## Özellikler

- **PCB Editörü** — tek/çift katman, pan/zoom, ızgara + yaslama, 45° iz çizimi, via ile katman geçişi, iz köşe noktası düzenleme, bakır alanlar (zone), undo/redo, kopyala/yapıştır
- **Şema Editörü** — otomatik kutu sembolleri, ortogonal tel çizimi, net etiketleme; teller PCB netlerine **otomatik senkronize** edilir
- **75+ hazır komponent** gerçek ölçüleriyle: Arduino Uno/Nano/Pro Mini, ESP32/ESP8266, Raspberry Pi Pico, motor sürücüler (L298N, A4988, DRV8825, TB6612), pasifler, IC'ler, konnektörler, sensör modülleri
- **Footprint editörü** — kendi ölçülerinizle komponent oluşturun, hazır komponentleri kopyalayıp düzenleyin, `.cayalib` olarak paylaşın
- **Pin/Net editörü** — hazır kartların pinlerine tablo üzerinden kolayca GND/VCC/5V gibi netler atayın; pad adları ve netler yakınlaşınca kartın üstünde görünür
- **Otorouter** — A* tabanlı, çift katman + otomatik via, ayarlanabilir (çözünürlük, via cezası, iz genişliği, clearance)
- **DRC** — boşluk ihlalleri, kısa devreler, eksik bağlantılar, kenar mesafesi; ihlale tıklayınca zoom
- **Otomatik hesaplar** — IPC-2221 iz genişliği/akım, via akımı, iz direnci/gerilim düşümü, mikroşerit empedansı; seçili izin analizi canlı gösterilir
- **Dışa aktarma** — Gerber RS-274X + Excellon (üretici), SVG (lazer kesim/toner transfer, ayna/negatif), G-code (CNC izolasyon frezeleme + delme + kesim), PNG, BOM, Pick&Place — katman katman veya toplu
- **TR / EN** tam dil desteği

## Geliştirme

```bash
npm install
npm run dev        # tarayıcıda (web sürümü): http://localhost:5173
npm start          # Electron penceresinde (dev sunucusuyla birlikte)
```

## Dağıtım derlemeleri

```bash
npm run dist:win   # Windows .exe (NSIS) — Windows üzerinde
npm run dist:mac   # macOS .dmg — yalnızca macOS üzerinde çalışır!
```

### macOS derlemesini Windows'tan almak

macOS `.dmg` paketi Windows üzerinde üretilemez (Apple araç zinciri gerekir).
Bu depo GitHub'a push'landığında hazır CI ile her iki platform da derlenir:

1. Depoyu GitHub'a push'layın
2. Sürüm etiketi atın: `git tag v1.0.0 && git push origin v1.0.0`
   (veya Actions sekmesinden **Masaüstü Derlemeleri** iş akışını elle çalıştırın)
3. Actions çıktısından `caya-pcb-studio-mac` (.dmg) ve `caya-pcb-studio-win` (.exe) artifact'lerini indirin

### Web dağıtımı

```bash
npm run build      # dist/ klasörü — herhangi bir statik hosta yüklenebilir
```

Uygulama tarayıcıda tam işlevlidir (dosya kaydetme/açma dahil, Chromium tabanlı tarayıcılarda konum seçtirerek).

## Dosya formatları

| Uzantı | İçerik |
|---|---|
| `.cayapcb` | Proje dosyası (JSON): kart, komponentler, izler, şema, özel footprint'ler |
| `.cayalib` | Footprint kütüphanesi (JSON) — içe/dışa aktarılabilir |
| `.gtl/.gbl/.gto/.gbo/.gm1/.drl` | Gerber + Excellon üretim seti |
| `.nc` | CNC G-code (izolasyon/delme/kesim) |

## Klavye kısayolları

| Tuş | İşlev |
|---|---|
| S / T / V / N / M | Seç / İz / Via / Net / Ölçüm |
| R, F | Döndür, yüz değiştir |
| 1, 2 | Üst / alt bakır katmanı |
| G | Izgara adımını değiştir |
| V (iz çizerken) | Via koy, karşı katmanda devam et |
| Enter / Esc | İzi bitir / iptal |
| Ctrl+Z / Ctrl+Y | Geri al / yinele |
| Ctrl+C / Ctrl+V / Ctrl+A | Kopyala / yapıştır / tümünü seç |
| Home | Kartı ekrana sığdır |
| Boşluk + sürükle | Görünümü kaydır |
| W (şema modunda) | Tel çiz |

## Katkıda bulunma

Hata bildirimleri ve özellik istekleri için [Issues](../../issues) sekmesini kullanabilirsiniz. Pull request'ler memnuniyetle karşılanır.

## Lisans

Bu proje [MIT lisansı](LICENSE) ile lisanslanmıştır.

---

© 2026 CaYaDev — [cayadev.com](https://cayadev.com)
