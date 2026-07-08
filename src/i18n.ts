// ─── Dil desteği (TR / EN) ────────────────────────────────────────────────
// Türkçe metinler anahtar olarak kullanılır; İngilizce çeviriler `en`
// sözlüğünden gelir. Eksik çeviri anahtara (Türkçe) düşer. {param}
// yer tutucuları desteklenir.

import { create } from 'zustand'

export type Lang = 'tr' | 'en'

interface I18nState {
  lang: Lang
  setLang: (l: Lang) => void
}

const stored =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem('caya-lang') as Lang | null)
    : null

export const useI18n = create<I18nState>((set) => ({
  lang: stored === 'en' ? 'en' : 'tr',
  setLang: (lang) => {
    try {
      localStorage.setItem('caya-lang', lang)
    } catch {
      /* localStorage kullanılamıyorsa yoksay */
    }
    set({ lang })
  }
}))

/** Çeviri: anahtar Türkçe metindir */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = useI18n.getState().lang
  let s = lang === 'en' ? (en[key] ?? key) : key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}

/** React bileşenlerinde: dil değişince yeniden render tetikler */
export function useT() {
  useI18n((s) => s.lang)
  return t
}

// ─── İngilizce sözlük ─────────────────────────────────────────────────────

const en: Record<string, string> = {
  // ── Genel / araçlar ──
  'Seç': 'Select',
  'Seç / Taşı': 'Select / Move',
  'İz': 'Trace',
  'İz Çiz': 'Draw Trace',
  'Alan': 'Zone',
  'Yazı': 'Text',
  'Net': 'Net',
  'Net Ata': 'Assign Net',
  'Ölçüm': 'Measure',
  'Sil': 'Delete',
  'Yeni': 'New',
  'Aç': 'Open',
  'Kaydet': 'Save',
  'Kart': 'Board',
  'Hesap': 'Calc',
  'Otoroute': 'Autoroute',
  'Dışa Aktar': 'Export',
  'Şema': 'Schematic',
  'İptal': 'Cancel',
  'Tamam': 'OK',
  'Uygula': 'Apply',
  'Güncelle': 'Update',
  'Düzenle': 'Edit',
  'Temizle': 'Clear',
  'Döndür': 'Rotate',
  'Yüz Değiştir': 'Flip Side',
  'Üst': 'Top',
  'Alt': 'Bottom',
  'üst': 'top',
  'alt': 'bottom',
  'Katman': 'Layer',
  'Katmanlar': 'Layers',
  'Izgara': 'Grid',
  'Taşı': 'Move',
  'Dış hat çiz': 'Draw outline',
  'Bitir': 'Finish',
  'Dış hattı sil': 'Delete outline',
  'Pad ve etiketleri taşı': 'Move pads and labels',
  'Gövde dış hattını köşe köşe çiz — çift tık ile bitir': 'Draw the body outline vertex by vertex — double-click to finish',
  'Dikdörtgen gövdeye dön': 'Back to rectangular body',
  'Izgaraya yasla (Shift: serbest)': 'Snap to grid (Shift: free)',
  'Köşe eklemek için tıklayın · çift tık/Bitir ile kapatın': 'Click to add a vertex · double-click/Finish to close',
  'Pad\'i veya adını sürükleyerek taşıyın (adlar çizgilere binmesin)': 'Drag a pad or its name to move it (so names don\'t overlap lines)',
  'aktif': 'active',
  'Önizleme': 'Preview',
  'Özellikler': 'Properties',
  'Komponent': 'Component',
  'Proje': 'Project',
  'özel': 'custom',
  'atanmamış': 'unassigned',
  '(atanmamış)': '(unassigned)',
  'pad': 'pad',
  'iz': 'trace',
  'bakır alan': 'copper zone',
  'İsimsiz': 'Untitled',
  'Normal': 'Normal',

  // ── Araç çubuğu ──
  'Yeni Proje': 'New Project',
  'Proje Aç': 'Open Project',
  'Farklı Kaydet': 'Save As',
  'Farklı Kaydet (yeni konum)': 'Save As (new location)',
  'Başlangıç': 'Home',
  'Başlangıç ekranı (son kullanılanlar)': 'Start screen (recent files)',
  'Kaydedilemedi: {err}': 'Could not save: {err}',
  'Devre kartı tasarımına başlayın': 'Start designing your circuit board',
  'Boş bir kartla başla': 'Start with a blank board',
  'Bilgisayardan .cayapcb seç': 'Choose a .cayapcb from your computer',
  'Dosyadan .cayapcb yükle': 'Load a .cayapcb from a file',
  'Son kullanılanlar': 'Recent files',
  'Henüz proje yok — yeni bir proje oluşturun.': 'No projects yet — create a new one.',
  'Editöre geç →': 'Go to editor →',
  'Bu proje artık bulunamadı': 'This project could not be found anymore',
  'az önce': 'just now',
  '{n} dk önce': '{n} min ago',
  '{n} sa önce': '{n} h ago',
  '{n} gün önce': '{n} d ago',
  'Yeni proje adı': 'New project name',
  'Proje Aç (.cayapcb)': 'Open Project (.cayapcb)',
  'Projeyi Kaydet': 'Save Project',
  'Geri Al': 'Undo',
  'Yinele': 'Redo',
  'Geri alındı': 'Undone',
  'Yinelendi': 'Redone',
  'Otomatik rotalama': 'Automatic routing',
  'Tasarım kuralı denetimi': 'Design rule check',
  'Elektriksel hesaplayıcılar': 'Electrical calculators',
  'Footprint editörü': 'Footprint editor',
  'Kart ayarları ve tasarım kuralları': 'Board settings & design rules',
  'Dışa aktar': 'Export',
  'Dil / Language': 'Language',
  'Kart yerleşimi ve rotalama': 'Board layout & routing',
  '3B Görünüm': '3D View',
  '3B görünüm — kartı ve bileşenleri üç boyutlu görüntüleyin':
    '3D view — see the board and components in three dimensions',
  '3B görünüm — sürükle: döndür, tekerlek: yakınlaştır, sağ tık: kaydır':
    '3D view — drag: rotate, wheel: zoom, right-drag: pan',
  '{name} şemaya eklendi': '{name} added to schematic',
  'Komponent eklemek için PCB veya Şema moduna geçin':
    'Switch to PCB or Schematic mode to add a component',
  'Devre şeması — teller PCB netlerine senkronlanır':
    'Circuit schematic — wires sync to PCB nets',
  'CaYa PCB Studio — Geliştirici: CaYaDev · cayadev.com':
    'CaYa PCB Studio — Developer: CaYaDev · cayadev.com',
  'Proje açılamadı: {err}': 'Could not open project: {err}',
  '"{name}" kaydedildi (.cayapcb)': '"{name}" saved (.cayapcb)',
  '"{name}" yüklendi': '"{name}" loaded',
  'Yeni proje oluşturuldu': 'New project created',
  'Izgara: {g} mm': 'Grid: {g} mm',

  // ── Durum çubuğu ──
  '1 katman': '1 layer',
  '2 katman': '2 layers',
  '{c} komp · {t} iz · {v} via': '{c} comp · {t} traces · {v} vias',
  'PCB modu': 'PCB mode',
  'Şema modu — W: tel çiz, teller PCB netlerine senkronlanır':
    'Schematic mode — W: draw wire, wires sync to PCB nets',

  // ── Araç ipuçları / durum mesajları ──
  'Seçim — tıkla/sürükle, R: döndür, F: yüz değiştir, Del: sil. Tek iz seçiliyken köşe noktaları sürüklenebilir':
    'Select — click/drag, R: rotate, F: flip, Del: delete. With a single trace selected you can drag its vertices',
  'İz çizimi — pad\'e tıklayıp başlayın, V: via ile katman değiştir, çift tık/Enter: bitir':
    'Trace — click a pad to start, V: switch layer via a via, double-click/Enter: finish',
  'Via — eklemek için tıklayın': 'Via — click to place',
  'Yazı — eklemek için tıklayın': 'Text — click to place',
  'Bakır alan — köşeden köşeye sürükleyin': 'Copper zone — drag corner to corner',
  'Ölçüm — sürükleyin; Shift: 45° kilidi. Ölçüm sonrası seçimi bu vektörle taşıyabilirsiniz':
    'Measure — drag; Shift: 45° lock. Afterwards you can move the selection by the measured vector',
  'Net atama — pad\'e tıklayarak net adı verin': 'Assign net — click a pad to name its net',
  'Silme — nesnelere tıklayın': 'Delete — click objects',
  'Aktif katman: {layer}': 'Active layer: {layer}',
  'Üst bakır': 'Top copper',
  'Alt bakır': 'Bottom copper',
  '{n} nesne silindi': '{n} objects deleted',
  '{n} nesne kopyalandı': '{n} objects copied',
  '{n} nesne seçildi': '{n} objects selected',
  '{n} nesne seçili': '{n} objects selected',
  '{n} nesne': '{n} objects',
  'Yapıştırıldı': 'Pasted',
  'Döndürüldü (90°)': 'Rotated (90°)',
  'Karşı yüze aktarıldı': 'Flipped to other side',
  'Taşınacak seçim yok': 'No selection to move',
  'Seçim taşındı: Δx={dx}, Δy={dy} mm': 'Selection moved: Δx={dx}, Δy={dy} mm',
  'Yerleştirmek için karta tıklayın — Shift: çoklu, Esc: iptal':
    'Click the board to place — Shift: multiple, Esc: cancel',
  'Shift ile çoklu yerleştirme — Esc: bitir': 'Shift for multiple placement — Esc: finish',
  '{name} yerleştirildi': '{name} placed',
  'İz çizildi': 'Trace drawn',
  'İz tamamlandı': 'Trace completed',
  'İz başladı — bu pad\'e net atanmamış (Net aracıyla atayabilirsiniz)':
    'Trace started — this pad has no net (assign one with the Net tool)',
  'Via eklendi': 'Via placed',
  'Via eklendi — {layer} katmanda devam': 'Via placed — continuing on {layer} layer',
  'Yazı eklendi': 'Text added',
  'Net atandı: {net}': 'Net assigned: {net}',
  'Net kaldırıldı': 'Net removed',
  'Net atamak için bir pad\'e tıklayın': 'Click a pad to assign a net',
  'Bakır alan eklendi ({net})': 'Copper zone added ({net})',
  'Bakır alan net adı': 'Copper zone net name',
  'Genellikle GND': 'Usually GND',
  'Silkscreen yazısı': 'Silkscreen text',
  'Örn: CaYa v1.0': 'E.g.: CaYa v1.0',
  'Örn: VCC, GND, SIG1': 'E.g.: VCC, GND, SIG1',
  'Net adı — {ref} pad {pad}': 'Net name — {ref} pad {pad}',
  'Ölçüm: {len} mm — Δx={dx}, Δy={dy}': 'Measured: {len} mm — Δx={dx}, Δy={dy}',
  '{n} eksik bağlantı': '{n} unrouted connections',
  'tüm bağlantılar tamam': 'all connections complete',
  '{n} kısa devre!': '{n} short circuits!',
  'Tek katmanlı kart — alt bakır kapalı (Kart ayarlarından değiştirin)':
    'Single-layer board — bottom copper disabled (change in Board settings)',
  'Tek katmanlı kartta yüz değiştirilemez': 'Cannot flip on a single-layer board',
  'Tek katmanlı kartta via ile katman değiştirilemez':
    'Cannot switch layers with via on a single-layer board',

  // ── Araç ayar çubuğu ──
  'İz genişliği': 'Trace width',
  'İz genişliği: {w} mm': 'Trace width: {w} mm',
  'Çizim sürüyor — V: via ile katman değiştir, Enter: bitir':
    'Drawing — V: switch layer with via, Enter: finish',
  'Via dış çapı': 'Via outer diameter',
  'Delik': 'Drill',
  'Tek katmanlı kart — via katman değiştirmez':
    'Single-layer board — vias do not switch layers',
  'Yazı boyutu': 'Text size',
  'Yazılar üretim uyumlu çizgi (stroke) fontla çizilir — seçip Özellikler\'den boyut/kalınlık değiştirilebilir':
    'Text uses a fabrication-ready stroke font — select it to change size/bold in Properties',
  'Bakır alan boşluğu': 'Zone clearance',
  'Alan, farklı netlerin çevresinde otomatik boşluk bırakır':
    'The zone automatically keeps clearance around other nets',
  'Önce Seç aracıyla nesne seçin': 'First select objects with the Select tool',
  'Seçimi bu vektörle taşı': 'Move selection by this vector',
  'Sürükleyerek ölçün (ızgaraya yaslanır, Shift: 45°) — sonra seçimi ölçülen vektörle taşıyabilirsiniz':
    'Drag to measure (snaps to grid, Shift: 45°) — then move the selection by the measured vector',
  'Nesnelere tıklayın veya alan seçin — tek iz seçince köşe noktalarını sürükleyebilirsiniz':
    'Click objects or drag-select — with one trace selected you can drag its vertices',
  'Pad\'e tıklayıp net adı verin (GND, VCC, SIG1...) — aynı addaki pad\'ler ratsnest ile bağlanır ve otorouter bunları çizer':
    'Click a pad and name its net (GND, VCC, SIG1...) — same-named pads get ratsnest lines and the autorouter routes them',
  'Silme modu — tıklanan nesne silinir (Ctrl+Z ile geri alınabilir)':
    'Delete mode — clicked objects are removed (Ctrl+Z to undo)',

  // ── Katman paneli ──
  'Üst silkscreen': 'Top silkscreen',
  'Alt silkscreen': 'Bottom silkscreen',
  'Bakır alanlar': 'Copper zones',
  'Delikler': 'Drills',
  'Kart sınırı': 'Board outline',
  'Ratsnest (hava telleri)': 'Ratsnest (airwires)',
  'Aktif çizim katmanı yap': 'Make active drawing layer',
  '(tek katman)': '(single layer)',
  '(çift katman)': '(double layer)',

  // ── Kütüphane ──
  'Komponent Kütüphanesi': 'Component Library',
  '🔍 Ara: arduino, esp, direnç...': '🔍 Search: arduino, esp, resistor...',
  'Kendi ölçülerinizle yeni komponent oluşturun': 'Create a component with your own dimensions',
  'Footprint kütüphanesi içe aktar (.cayalib)': 'Import footprint library (.cayalib)',
  'Özel footprint\'leri dışa aktar (.cayalib)': 'Export custom footprints (.cayalib)',
  'İçe Al': 'Import',
  'Dışa Ver': 'Export',
  '{n} footprint içe aktarıldı': '{n} footprints imported',
  'İçe aktarma hatası: {err}': 'Import error: {err}',
  'Dışa aktarılacak özel footprint yok — önce Footprint editörüyle oluşturun':
    'No custom footprints to export — create one with the Footprint editor first',
  '{n} özel footprint dışa aktarıldı (.cayalib)': '{n} custom footprints exported (.cayalib)',
  'Komponent yerleştirmek için PCB moduna geçin': 'Switch to PCB mode to place components',

  // ── Kategoriler ──
  'Mikrodenetleyici': 'Microcontroller',
  'Motor Sürücü': 'Motor Driver',
  'Direnç': 'Resistor',
  'Kondansatör': 'Capacitor',
  'Diyot & LED': 'Diode & LED',
  'Transistör & Regülatör': 'Transistor & Regulator',
  'Entegre (IC)': 'Integrated Circuit',
  'Konnektör': 'Connector',
  'Buton & Mekanik': 'Button & Mechanical',
  'Sensör & Modül': 'Sensor & Module',
  'Özel': 'Custom',

  // ── Footprint adları ──
  'L298N Motor Sürücü Modülü': 'L298N Motor Driver Module',
  'A4988 Step Motor Sürücü': 'A4988 Stepper Driver',
  'DRV8825 Step Motor Sürücü': 'DRV8825 Stepper Driver',
  'TB6612FNG Motor Sürücü': 'TB6612FNG Motor Driver',
  'Direnç 1/4W (Axial)': 'Resistor 1/4W (Axial)',
  'Direnç 1/2W (Axial)': 'Resistor 1/2W (Axial)',
  'Direnç 0603 (SMD)': 'Resistor 0603 (SMD)',
  'Direnç 0805 (SMD)': 'Resistor 0805 (SMD)',
  'Direnç 1206 (SMD)': 'Resistor 1206 (SMD)',
  'Potansiyometre RV09': 'Potentiometer RV09',
  'Seramik Kondansatör (2.54)': 'Ceramic Capacitor (2.54)',
  'Seramik Kondansatör (5.08)': 'Ceramic Capacitor (5.08)',
  'Elektrolitik 5 mm': 'Electrolytic 5 mm',
  'Elektrolitik 6.3 mm': 'Electrolytic 6.3 mm',
  'Elektrolitik 8 mm': 'Electrolytic 8 mm',
  'Elektrolitik 10 mm': 'Electrolytic 10 mm',
  'Kondansatör 0603 (SMD)': 'Capacitor 0603 (SMD)',
  'Kondansatör 0805 (SMD)': 'Capacitor 0805 (SMD)',
  'Kondansatör 1206 (SMD)': 'Capacitor 1206 (SMD)',
  'LED 0805 (SMD)': 'LED 0805 (SMD)',
  'LM2596 Buck Modülü': 'LM2596 Buck Module',
  'DIP-40 geniş (ATmega32...)': 'DIP-40 wide (ATmega32...)',
  'Vida Klemens 2P (5.08)': 'Screw Terminal 2P (5.08)',
  'Vida Klemens 3P (5.08)': 'Screw Terminal 3P (5.08)',
  'Tact Buton 6×6': 'Tact Button 6×6',
  'Kristal HC-49S': 'Crystal HC-49S',
  'Röle SRD-05VDC': 'Relay SRD-05VDC',
  'HC-SR04 Ultrasonik': 'HC-SR04 Ultrasonic',
  'NRF24L01+ Modülü': 'NRF24L01+ Module',
  'DS3231 RTC Modülü': 'DS3231 RTC Module',
  // ── SMD footprint adları ──
  'Direnç 0201 (SMD)': 'Resistor 0201 (SMD)',
  'Direnç 0402 (SMD)': 'Resistor 0402 (SMD)',
  'Direnç 1210 (SMD)': 'Resistor 1210 (SMD)',
  'Direnç 2512 (SMD)': 'Resistor 2512 (SMD)',
  'Kondansatör 0402 (SMD)': 'Capacitor 0402 (SMD)',
  'Kondansatör 1210 (SMD)': 'Capacitor 1210 (SMD)',
  'SMD Elektrolitik Ø4': 'SMD Electrolytic Ø4',
  'SMD Elektrolitik Ø6.3': 'SMD Electrolytic Ø6.3',
  'SMD Elektrolitik Ø8': 'SMD Electrolytic Ø8',
  'Tantalum A (3216)': 'Tantalum A (3216)',
  'Tantalum B (3528)': 'Tantalum B (3528)',
  'Tantalum C (6032)': 'Tantalum C (6032)',
  'Tantalum D (7343)': 'Tantalum D (7343)',
  'Diyot SOD-123': 'Diode SOD-123',
  'Diyot SOD-323': 'Diode SOD-323',
  'Diyot SMA (DO-214AC)': 'Diode SMA (DO-214AC)',
  'Diyot SMB (DO-214AA)': 'Diode SMB (DO-214AA)',
  'Diyot SMC (DO-214AB)': 'Diode SMC (DO-214AB)',
  'LED 0603 (SMD)': 'LED 0603 (SMD)',
  'LED 1206 (SMD)': 'LED 1206 (SMD)',
  'LED 3528 (PLCC-2)': 'LED 3528 (PLCC-2)',
  'SOP-8 geniş (SO-8W)': 'SOP-8 wide (SO-8W)',
  'USB-C Dişi (16 pin SMD)': 'USB-C Female (16-pin SMD)',
  'Micro-USB Dişi (SMD)': 'Micro-USB Female (SMD)',

  // ── Özellikler paneli ──
  'Nesne seçilmedi.': 'Nothing selected.',
  'Kısayollar': 'Shortcuts',
  'iz çiz': 'trace',
  'döndür': 'rotate',
  'yüz değiştir': 'flip',
  'net ata': 'assign net',
  'katman': 'layer',
  'ızgara': 'grid',
  'geri al': 'undo',
  'sığdır': 'fit',
  'Boşluk+sürükle: kaydır': 'Space+drag: pan',
  'Referans': 'Reference',
  'Değer': 'Value',
  'Rotasyon': 'Rotation',
  'Yüz': 'Side',
  'Pinleri / Netleri Düzenle': 'Edit Pins / Nets',
  'Footprint\'i Düzenle': 'Edit Footprint',
  'Net atamaları': 'Net assignments',
  'Dış çap (mm)': 'Outer dia (mm)',
  'Delik (mm)': 'Drill (mm)',
  'Metin': 'Text',
  'Boyut (mm)': 'Size (mm)',
  'Kalın': 'Bold',
  'Bakır Alan': 'Copper Zone',
  'Boşluk (mm)': 'Clearance (mm)',
  'Genişlik (mm)': 'Width (mm)',
  'İpucu: köşe noktalarını canvas üzerinde sürükleyerek düzenleyebilirsiniz':
    'Tip: drag the vertex handles on the canvas to edit the path',
  'Otomatik analiz': 'Automatic analysis',
  'Uzunluk': 'Length',
  'Maks. akım': 'Max current',
  'Gerilim düşümü': 'Voltage drop',
  'Güç kaybı': 'Power loss',

  // ── Pin editörü ──
  'Pin / Net Editörü': 'Pin / Net Editor',
  'Bir satıra tıklayıp hızlı net butonlarını kullanın veya elle yazın. Boş bırakılan pin atanmamış olur.':
    'Click a row and use the quick-net buttons, or type manually. Empty pins remain unassigned.',
  'Pin': 'Pin',
  'Hızlı': 'Quick',
  '{ref} pin netleri güncellendi': '{ref} pin nets updated',
  'Footprint ölçülerini/pad adlarını düzenle (kopya oluşturulur)':
    'Edit footprint dimensions/pad names (a copy is created)',

  // ── Footprint editörü ──
  'Footprint Editörü': 'Footprint Editor',
  'düzenleniyor': 'editing',
  'Ad': 'Name',
  'Kategori': 'Category',
  'Açıklama': 'Description',
  'Ölçüler, notlar...': 'Dimensions, notes...',
  'Gövde G (mm)': 'Body W (mm)',
  'Gövde Y (mm)': 'Body H (mm)',
  'Hızlı pad üreteci': 'Quick pad generator',
  'Sıra': 'Rows',
  'Sütun': 'Columns',
  'Pitch': 'Pitch',
  'Sıra aralığı': 'Row spacing',
  'Izgara Üret': 'Generate Grid',
  'Pad\'ler': 'Pads',
  'Şekil': 'Shape',
  'Daire': 'Circle',
  'Kare': 'Rect',
  'Oval': 'Oval',
  'Delikli': 'Through-hole',
  'SMD üst': 'SMD top',
  'SMD alt': 'SMD bottom',
  'Pad Ekle': 'Add Pad',
  'Formu Temizle': 'Clear Form',
  'Kütüphaneye Kaydet': 'Save to Library',
  'Var olanı düzenle': 'Edit existing',
  'Hazır footprint seç (kopyalanır)...': 'Pick a built-in footprint (copied)...',
  'Kayıtlı özel footprint\'ler': 'Saved custom footprints',
  'Yeni Komponent': 'New Component',
  'En az bir pad gerekli': 'At least one pad is required',
  '"{name}" kütüphaneye eklendi — Özel kategorisinde':
    '"{name}" added to library — under Custom category',
  'Yerleşik "{name}" kopyalanıyor — kaydedince Özel kategorisine eklenir':
    'Copying built-in "{name}" — saving adds it to the Custom category',
  'Özel footprint kaydedildi: {name}': 'Custom footprint saved: {name}',
  'Özel footprint silindi': 'Custom footprint deleted',

  // ── Kart ayarları ──
  'Kart Ayarları & Tasarım Kuralları': 'Board Settings & Design Rules',
  'Kart ayarları güncellendi': 'Board settings updated',
  'Proje adı': 'Project name',
  'Genişlik': 'Width',
  'Yükseklik': 'Height',
  'Kart şekli': 'Board shape',
  'Dikdörtgen / Kare': 'Rectangle / Square',
  'Serbest çizim': 'Freeform',
  'Çap': 'Diameter',
  'Kart dış hattı serbest çizimle belirlenir. Aşağıdaki düğmeyle kartı doğrudan tuval üzerinde çizin.':
    'The board outline is set by freeform drawing. Use the button below to draw the board directly on the canvas.',
  'Kartı Çiz (serbest)': 'Draw Board (freeform)',
  'Kartı tuval üzerinde köşe köşe çizin — çift tık/Enter ile bitirin':
    'Draw the board corner by corner on the canvas — double-click/Enter to finish',
  'Kart dış hattı çiziliyor — köşe eklemek için tıklayın, bitirmek için çift tık/Enter':
    'Drawing board outline — click to add corners, double-click/Enter to finish',
  'Kart dış hattı serbest çizimle güncellendi': 'Board outline updated via freeform drawing',
  'Kart Çizimi': 'Board Drawing',
  'Kart dış hattı çizimi — köşe eklemek için tıklayın, çift tık/Enter: bitir, Esc: iptal':
    'Board outline drawing — click to add corners, double-click/Enter: finish, Esc: cancel',
  'Köşe yuvarlatma': 'Corner radius',
  'Dış hat çizgi kalınlığı (mm)': 'Outline line thickness (mm)',
  'Katman sayısı': 'Layer count',
  'Çift katman (üst + alt)': 'Double layer (top + bottom)',
  'Tek katman (yalnız üst)': 'Single layer (top only)',
  'Tek katmanda via/alt bakır kapalıdır; otorouter yalnız üst katmanı kullanır. Alt yüzdeki komponentler üste taşınır.':
    'Single layer disables vias/bottom copper; the autorouter uses only the top layer. Bottom-side components are moved to top.',
  'Köşelerde montaj deliği': 'Corner mounting holes',
  'Delik çapı': 'Hole diameter',
  'Tasarım kuralları (DRC)': 'Design rules (DRC)',
  'Min. iz genişliği': 'Min trace width',
  'Bakır boşluğu (clearance)': 'Copper clearance',
  'Min. via deliği': 'Min via drill',
  'Min. via halkası': 'Min annular ring',
  'Kart kenarı boşluğu': 'Board edge clearance',
  'Bakır ağırlığı': 'Copper weight',
  'Varsayılanlar': 'Defaults',
  'Via deliği': 'Via drill',
  'İpucu: yüksek akım hatları için gereken genişliği Hesaplayıcılar\'dan (🧮) bulabilirsiniz.':
    'Tip: find the width required for high-current traces in Calculators (🧮).',

  // ── Otorouter ──
  'Otomatik Rotalama': 'Automatic Routing',
  'A* algoritması eksik bağlantıları otomatik çizer: 45° rotalar, engellerden kaçınma ve tasarım kuralı (clearance) uyumu.':
    'The A* algorithm routes unfinished connections automatically: 45° paths, obstacle avoidance and design-rule (clearance) compliance.',
  'Tek katman modu: yalnız üst bakır, via kullanılmaz.':
    'Single-layer mode: top copper only, no vias.',
  'Çift katman: gerektiğinde otomatik via ile katman değiştirir.':
    'Double layer: switches layers with automatic vias when needed.',
  'Rotalama ayarları': 'Routing settings',
  'İz genişliği (mm)': 'Trace width (mm)',
  'Bakır boşluğu (mm)': 'Copper clearance (mm)',
  'Izgara çözünürlüğü': 'Grid resolution',
  'hızlı': 'fast',
  'dengeli': 'balanced',
  'hassas': 'fine',
  'çok hassas (yavaş)': 'very fine (slow)',
  'Via cezası': 'Via cost',
  'Düşük — via serbest': 'Low — vias are cheap',
  'Yüksek — az via': 'High — fewer vias',
  'Çok yüksek — mecbur kalmadıkça via yok': 'Very high — vias only when unavoidable',
  '{n} eksik bağlantı rotalanmayı bekliyor': '{n} unrouted connections waiting',
  'Tüm net bağlantıları tamamlanmış görünüyor': 'All net connections appear complete',
  'İpucu: Netleri üç yolla verebilirsiniz — Şema modunda tel çizerek, Net (N) aracıyla pad\'e tıklayarak veya komponent seçip Pin/Net Editörü\'nü kullanarak.':
    'Tip: assign nets three ways — draw wires in Schematic mode, click pads with the Net (N) tool, or select a component and use the Pin/Net Editor.',
  'Rotalanıyor...': 'Routing...',
  'Rotalamayı Başlat': 'Start Routing',
  'Sonuç: {n} bağlantı rotalandı': 'Result: {n} connections routed',
  '{n} net başarısız': '{n} nets failed',
  'Başarısız netler için: kart alanını büyütün, iz genişliğini/çözünürlüğü küçültün veya elle rotalayın. Geri almak için Ctrl+Z.':
    'For failed nets: enlarge the board, reduce trace width/resolution, or route manually. Ctrl+Z to undo.',
  'Otorouter: {n} bağlantı rotalandı': 'Autorouter: {n} connections routed',
  'Otorouter: rotalanacak bağlantı bulunamadı': 'Autorouter: nothing to route',
  'rotalandı ({n} nokta)': 'routed ({n} points)',
  'rotalanamadı, yol bulunamadı': 'failed, no path found',
  'SMD pad tek katman modunda erişilemez': 'SMD pad unreachable in single-layer mode',

  // ── DRC ──
  'Tasarım Kuralı Denetimi': 'Design Rule Check',
  '{n} hata': '{n} errors',
  '{n} uyarı': '{n} warnings',
  'Yeniden Çalıştır': 'Run Again',
  'Tebrikler — hiçbir kural ihlali bulunamadı!': 'Congratulations — no rule violations found!',
  'Konuma zoom yap': 'Zoom to location',
  'HATA': 'ERROR',
  'UYARI': 'WARNING',
  'DRC temiz — ihlal yok ✓': 'DRC clean — no violations ✓',
  'DRC: {e} hata, {w} uyarı': 'DRC: {e} errors, {w} warnings',
  'Boşluk ihlali: {a} ↔ {b} arası {gap} mm < {min} mm ({na} / {nb})':
    'Clearance violation: {a} ↔ {b} gap {gap} mm < {min} mm ({na} / {nb})',
  'İz genişliği {w} mm, minimum {min} mm kuralının altında':
    'Trace width {w} mm is below the {min} mm minimum',
  'Via delik çapı {d} mm, minimum {min} mm altında':
    'Via drill {d} mm is below the {min} mm minimum',
  'Via halkası {r} mm, minimum {min} mm altında':
    'Via annular ring {r} mm is below the {min} mm minimum',
  '{item} kart kenarına {e} mm\'den yakın veya kart dışında':
    '{item} is closer than {e} mm to the board edge or outside the board',
  '{item} montaj deliğine çok yakın ({gap} mm)':
    '{item} is too close to a mounting hole ({gap} mm)',
  'Kısa devre: {nets} netleri birbirine değiyor': 'Short circuit: nets {nets} are touching',
  'Tamamlanmamış bağlantı: "{net}" neti ({p1}) ↔ ({p2})':
    'Unrouted connection: net "{net}" ({p1}) ↔ ({p2})',
  'Komponent çakışması: {a} ↔ {b}': 'Component overlap: {a} ↔ {b}',

  // ── Hesaplayıcılar ──
  'Elektriksel Hesaplayıcılar': 'Electrical Calculators',
  'İz Genişliği (IPC-2221)': 'Trace Width (IPC-2221)',
  'Via Akımı': 'Via Current',
  'Direnç & Gerilim Düşümü': 'Resistance & Voltage Drop',
  'Empedans': 'Impedance',
  'Akım': 'Current',
  'Sıcaklık artışı': 'Temperature rise',
  'Dış katman minimum genişlik': 'External layer minimum width',
  'İç katman minimum genişlik': 'Internal layer minimum width',
  'Çift katmanlı kartta her iki katman da "dış katman" sayılır.':
    'On a two-layer board both layers count as "external".',
  'Varsayılan iz genişliği {w} mm yapıldı': 'Default trace width set to {w} mm',
  'Bu genişliği varsayılan yap': 'Make this the default width',
  'Kaplama kalınlığı': 'Plating thickness',
  'Via akım kapasitesi': 'Via current capacity',
  'Yüksek akımlar için birden fazla paralel via kullanın.':
    'Use multiple parallel vias for high currents.',
  'İz uzunluğu': 'Trace length',
  'Bu genişliğin taşıyabileceği akım (ΔT=10°C)': 'Current this width can carry (ΔT=10°C)',
  'Dielektrik kalınlığı (FR4)': 'Dielectric thickness (FR4)',
  'Bakır kalınlığı': 'Copper thickness',
  'Bağıl geçirgenlik (εr)': 'Relative permittivity (εr)',
  'Mikroşerit empedansı': 'Microstrip impedance',
  'IPC-2141 yaklaşımı — 1.6 mm FR4 için tipik εr = 4.5. 50 Ω hedefi için genişliği ayarlayın.':
    'IPC-2141 approximation — typical εr = 4.5 for 1.6 mm FR4. Adjust width for a 50 Ω target.',

  // ── Dışa aktarma ──
  '✓ {label} dışa aktarıldı': '✓ {label} exported',
  'Dışa aktarma hatası: {err}': 'Export error: {err}',
  'Gerber / Üretici': 'Gerber / Fab House',
  'SVG / Lazer': 'SVG / Laser',
  'PNG / Görsel': 'PNG / Image',
  'BOM / Proje': 'BOM / Project',
  'PCB üreticilerine (JLCPCB, PCBWay vb.) gönderilecek standart üretim dosyaları: üst/alt bakır, üst/alt silkscreen, kart sınırı ve Excellon delik dosyası.':
    'Standard fabrication files for PCB manufacturers (JLCPCB, PCBWay etc.): top/bottom copper, top/bottom silkscreen, board outline and Excellon drill file.',
  'Gerber seti (6 dosya)': 'Gerber set (6 files)',
  'Tüm Gerber Setini İndir (6 dosya)': 'Download Full Gerber Set (6 files)',
  'Tek katman': 'Single layer',
  'Üst silk': 'Top silk',
  'Alt silk': 'Bottom silk',
  'Delik dosyası': 'Drill file',
  'Lazer kesim, toner transfer ve film pozlama için gerçek ölçülü (mm) vektör çıktılar.':
    'True-scale (mm) vector outputs for laser cutting, toner transfer and film exposure.',
  'Aynala (toner transfer / alt katman için)': 'Mirror (for toner transfer / bottom layer)',
  'Negatif (film pozlama)': 'Negative (film exposure)',
  'Üst bakır SVG': 'Top copper SVG',
  'Alt bakır SVG': 'Bottom copper SVG',
  'Üst silkscreen SVG': 'Top silkscreen SVG',
  'Kesim hattı SVG': 'Cut outline SVG',
  'Kesim hattı — lazer': 'Cut outline — laser',
  'Birleşik görünüm SVG': 'Composite view SVG',
  'Birleşik görünüm': 'Composite view',
  'CNC ile PCB üretimi: izolasyon frezeleme (bakır çevresi kazıma), delik delme ve kart kesimi. Alt katman otomatik aynalanır.':
    'CNC PCB fabrication: isolation milling (engraving around copper), drilling and board cutout. The bottom layer is mirrored automatically.',
  'Takım çapı (mm)': 'Tool diameter (mm)',
  'Kazıma derinliği (mm)': 'Cut depth (mm)',
  'İlerleme (mm/dk)': 'Feed rate (mm/min)',
  'Dalma (mm/dk)': 'Plunge rate (mm/min)',
  'Güvenli Z (mm)': 'Safe Z (mm)',
  'İş mili (RPM)': 'Spindle (RPM)',
  'Üst katman izolasyon G-code': 'Top layer isolation G-code',
  'Üst izolasyon': 'Top isolation',
  'Alt katman izolasyon G-code': 'Bottom layer isolation G-code',
  'Alt izolasyon — aynalı': 'Bottom isolation — mirrored',
  'Delme G-code': 'Drilling G-code',
  'Kart kesim G-code': 'Board cutout G-code',
  'Kart kesimi': 'Board cutout',
  'İzolasyon yolları bitmap kontur (0.05 mm çözünürlük) yöntemiyle üretilir; kesişen izler ve bakır alanlar doğru işlenir.':
    'Isolation paths are generated via bitmap contour tracing (0.05 mm resolution); intersecting traces and zones are handled correctly.',
  'Yüksek çözünürlüklü görseller (~600 DPI).': 'High-resolution images (~600 DPI).',
  'Birleşik PNG': 'Composite PNG',
  'Renkli birleşik görünüm': 'Full-color composite view',
  'Kart dış hattı + yollar (S/B)': 'Board outline + traces (B&W)',
  'Dış hat + yollar (S/B) SVG': 'Outline + traces (B&W) SVG',
  'Dış hat + yollar (S/B) PNG': 'Outline + traces (B&W) PNG',
  'Üst katman PNG': 'Top layer PNG',
  'Üst bakır (S/B üretim)': 'Top copper (B/W fabrication)',
  'Alt katman PNG (aynalı)': 'Bottom layer PNG (mirrored)',
  'Alt bakır — aynalı (S/B üretim)': 'Bottom copper — mirrored (B/W fabrication)',
  'Malzeme listesi, dizgi dosyası ve proje yedeği.':
    'Bill of materials, pick & place file and project backup.',
  'Malzeme listesi (BOM .csv)': 'Bill of materials (BOM .csv)',
  'Dizgi dosyası': 'Pick & place file',
  'Dizgi / Pick&Place (.csv)': 'Pick & Place (.csv)',
  'Proje dosyası (.cayapcb)': 'Project file (.cayapcb)',

  // ── Şematik ──
  'Tel': 'Wire',
  'Tel Çiz': 'Draw Wire',
  'Tele net adı ver': 'Name the wire net',
  'Net Adı': 'Net Name',
  'Net adı': 'Net name',
  'Net adı atandı: {name}': 'Net name assigned: {name}',
  'Tel silindi': 'Wire deleted',
  'Tel çizildi — netler PCB\'ye senkronlandı': 'Wire drawn — nets synced to PCB',
  'Komponent silindi (şema + PCB)': 'Component deleted (schematic + PCB)',
  'Sembol döndürüldü': 'Symbol rotated',
  'Çift tık: sembolde pin editörü, telde bitir · Teller PCB netlerine otomatik senkronlanır':
    'Double-click: pin editor on symbol, finish on wire · Wires sync to PCB nets automatically',

  // ── PCB rengi ──
  'PCB rengi (lehim maskesi)': 'PCB color (solder mask)',
  'Özel renk': 'Custom color',
  'Yeşil': 'Green',
  'Kırmızı': 'Red',
  'Mavi': 'Blue',
  'Siyah': 'Black',
  'Beyaz': 'White',
  'Mor': 'Purple',
  'Sarı': 'Yellow',
  'Turkuaz': 'Teal',

  // ── Ayarlar dialogu ──
  'Ayarlar': 'Settings',
  'Uygulama ayarları (bağlantı takibi vb.)': 'App settings (connection follow, etc.)',
  'Bağlantı takibi (izleri sürükle)': 'Connection follow (drag traces)',
  'Bir komponent, via veya iz taşındığında ona bağlı iz ve tel uçları birlikte hareket eder; bağlantı kopmaz. Kapatırsanız eski davranış (bağlantılar sabit kalır) geçerli olur.':
    'When a component, via or trace is moved, the connected trace and wire ends move with it so the connection is not broken. Turn it off for the old behavior (connections stay put).',
  'Bağlantı takibini etkinleştir': 'Enable connection follow',
  'Varsayılan: açık': 'Default: on',
  'Takip kapsamı': 'Follow scope',
  'Uçlar: yalnız pad merkezine oturan iz uçları · Tümü: pad\'e değen tüm köşe noktaları':
    'Ends: only trace ends sitting on a pad center · All: every vertex touching the pad',
  'Yalnız uçlar': 'Ends only',
  'Değen tüm noktalar': 'All touching points',
  'Bağlı viaları da taşı': 'Move connected vias too',
  'Bir pad üzerine oturan via komponentle birlikte hareket eder':
    'A via sitting on a pad moves along with the component',
  'Bırakınca izleri düzelt': 'Tidy traces on drop',
  'Taşıma bitince (anlık değil) bağlı izler az bozmayla toparlanır':
    'When the move ends (not live), connected traces are tidied with minimal disruption',
  'Bağlantı toleransı': 'Connection tolerance',
  'Bu mesafedeki (mm) uçlar "bağlı" sayılır': 'Ends within this distance (mm) count as "connected"',
  'Genel': 'General',
  'Şema & Netler': 'Schematic & Nets',
  'Şemada tel silinince net atamalarını temizle': 'Clear net assignments when a schematic wire is deleted',
  'Şema tarafında bir tel silindiğinde, yalnız o telin verdiği ve başka telle desteklenmeyen net atamaları da kaldırılır. Varsayılan: açık':
    'When a wire is deleted on the schematic side, net assignments that only that wire provided — and no other wire supports — are removed too. Default: on',
  'PCB\'de iz silinince net atamalarını temizle': 'Clear net assignments when a PCB trace is deleted',
  'PCB tarafında bir iz silindiğinde, yalnız o izin verdiği ve başka izle desteklenmeyen net atamaları da kaldırılır. Varsayılan: kapalı':
    'When a trace is deleted on the PCB side, net assignments that only that trace provided — and no other trace supports — are removed too. Default: off',
  'Şema değişince eski PCB izlerini kaldır': 'Remove stale PCB traces when the schematic changes',
  'Şemada bir bağlantı değişince (tel silme/rename), o pine bağlı ESKİ nete ait PCB izleri de kaldırılır; böylece PCB yönlendirmesi şema ile tutarlı kalır. Varsayılan: açık':
    'When a connection changes in the schematic (wire deleted/renamed), PCB traces of the pin\'s OLD net are removed too, keeping PCB routing consistent with the schematic. Default: on',
  'Bağlantıları temizle': 'Clear connections',
  'Seçtiğiniz bağlantıları tek adımda kaldırır. Geri almak için Ctrl+Z.':
    'Removes the connections you choose in one step. Use Ctrl+Z to undo.',
  'PCB izleri': 'PCB traces',
  'Şema telleri': 'Schematic wires',
  'Tümü': 'All',
  'Emin misiniz?': 'Are you sure?',
  'Tüm PCB izleri ve viaları silinecek.': 'All PCB traces and vias will be deleted.',
  'Tüm pad net atamaları temizlenecek.': 'All pad net assignments will be cleared.',
  'Tüm şema telleri silinecek.': 'All schematic wires will be deleted.',
  'Tüm PCB izleri, viaları, net atamaları ve şema telleri silinecek.':
    'All PCB traces, vias, net assignments and schematic wires will be deleted.',
  'Bağlantılar temizlendi': 'Connections cleared',
  'Standart şema sembolleri': 'Standard schematic symbols',
  'Pasif bileşenleri (direnç, kondansatör, diyot/LED, bobin, kristal) standart devre şeması sembolleriyle göster. Kapalıysa hepsi kutu sembolüdür. Varsayılan: açık':
    'Show passive components (resistor, capacitor, diode/LED, inductor, crystal) with standard schematic symbols. When off, everything is a box symbol. Default: on',
  'Kapatırken kaydedilmemiş değişiklik uyarısı': 'Warn about unsaved changes on close',
  'Kaydedilmemiş işiniz varken uygulamayı kapatmadan önce sorar':
    'Asks before closing the app while you have unsaved work',
  'Kaydedilmemiş değişiklikler var. Yine de çıkmak istiyor musunuz?':
    'You have unsaved changes. Do you still want to leave?',

  // ── Toplu / şema dışa aktarma ──
  'Tüm Gerber Setini Tek Klasöre Aktar (6 dosya)': 'Export Full Gerber Set to One Folder (6 files)',
  'Tüm Gerber Setini Tek Klasöre Aktar ({n} dosya)': 'Export Full Gerber Set to One Folder ({n} files)',
  'PCB üreticilerine (JLCPCB, PCBWay vb.) gönderilecek eksiksiz üretim seti: üst/alt bakır, lehim maskesi, lehim pastası (stencil), silkscreen, kart sınırı ve Excellon delik dosyası.':
    'Complete manufacturing set for PCB fabs (JLCPCB, PCBWay, etc.): top/bottom copper, solder mask, solder paste (stencil), silkscreen, board outline and Excellon drill file.',
  'Ayrı dosyalar': 'Individual files',
  'Üst maske': 'Top mask',
  'Alt maske': 'Bottom mask',
  'Üst pasta': 'Top paste',
  'Alt pasta': 'Bottom paste',
  'Mekanik': 'Mechanical',
  'DXF (mekanik)': 'DXF (mechanical)',
  'DXF — dış hat + delikler': 'DXF — outline + holes',
  'Kart dış hattı + iç kesimler + delikler — mekanik CAD (Fusion 360, SolidWorks, AutoCAD) ve CNC/lazer için':
    'Board outline + cutouts + holes — for mechanical CAD (Fusion 360, SolidWorks, AutoCAD) and CNC/laser',
  'Yalnız SMD pad\'ler — lazer/vinil stencil kesimi için': 'SMD pads only — for laser/vinyl stencil cutting',
  'Lehim pastası (stencil) SVG': 'Solder paste (stencil) SVG',
  'Üst lehim pastası — stencil': 'Top solder paste — stencil',
  'Pad açıklıkları (~0.05 mm genişleme) — lehim maskesi': 'Pad openings (~0.05 mm expansion) — solder mask',
  'Lehim maskesi SVG': 'Solder mask SVG',
  'Üst lehim maskesi': 'Top solder mask',
  'Kart dış hattı + pad konumları + silkscreen (refDes ve pin adları) — elle/makineyle dizgi rehberi':
    'Board outline + pad positions + silkscreen (refDes and pin names) — manual/machine assembly guide',
  'Montaj çizimi SVG': 'Assembly drawing SVG',
  'Üst montaj çizimi': 'Top assembly drawing',
  'Alt montaj çizimi SVG': 'Bottom assembly drawing SVG',
  'Alt montaj çizimi': 'Bottom assembly drawing',
  'Tüm SVG\'leri Tek Klasöre Aktar': 'Export All SVGs to One Folder',
  'Tüm G-code Dosyalarını Tek Klasöre Aktar': 'Export All G-code Files to One Folder',
  'Tüm PNG\'leri Tek Klasöre Aktar': 'Export All PNGs to One Folder',
  'Tümünü Tek Klasöre Aktar (BOM + Dizgi + Proje)': 'Export All to One Folder (BOM + P&P + Project)',
  'Şema görüntüsü': 'Schematic image',
  'Şema görüntüsü SVG': 'Schematic image SVG',
  'Şema görüntüsü PNG': 'Schematic image PNG',
  'Şema görüntüsü (PNG)': 'Schematic image (PNG)',
  '✓ {n} dosya tek seferde dışa aktarıldı': '✓ {n} files exported at once',
  'Toplu dışa aktarma iptal edildi': 'Bulk export cancelled',

  // ── Yeni: tekil nokta düzenleme / hassas mod ──
  'Köşe noktası': 'Vertex',
  'Noktayı sil': 'Delete point',
  'İzi buradan böl': 'Split trace here',
  'Teli buradan böl': 'Split wire here',
  'En yakın pad/uca bağla': 'Connect to nearest pad/end',
  'İz noktadan bölündü': 'Trace split at vertex',
  'Tel noktadan bölündü': 'Wire split at vertex',
  'İz köşe noktası silindi': 'Trace vertex deleted',
  'Tel köşe noktası silindi': 'Wire vertex deleted',
  'İz silindi': 'Trace deleted',
  'Yalnızca iç köşe noktasında bölünebilir': 'Can only split at an interior vertex',
  'Nokta en yakın bağlantıya bağlandı': 'Point connected to nearest anchor',
  'Yakında bağlanacak pad/uç bulunamadı (yaklaştırıp tekrar deneyin)':
    'No nearby pad/end found to connect (zoom in and retry)',
  'Çift tık: sembolde pin editörü, telde bitir · Tekil nokta: tıkla+Del veya sağ tık · Shift: hassas':
    'Double-click: pin editor on symbol, finish on wire · Single point: click+Del or right-click · Shift: fine',

  // ── Yeni: kısa devre ──
  'Kısa devre: iz {ref} pad\'inin üzerinden geçiyor{nets}':
    'Short circuit: a trace runs over pad {ref}{nets}',
  'Kısa devre: {a} ve {b} pad\'leri fiziksel çakışıyor':
    'Short circuit: pads {a} and {b} physically overlap',

  // ── Yeni: yazı tipleri ──
  'Yazı tipi': 'Font',
  'Standart': 'Standard',
  'İtalik': 'Italic',
  'Geniş': 'Wide',
  'Dar': 'Condensed',
  'El yazısı': 'Script',

  // ── Yeni: görseller ──
  'Görsel': 'Image',
  'Görsel Ekle (SVG/PNG)': 'Add Image (SVG/PNG)',
  'Karta SVG/PNG görsel (logo/işaret) ekle': 'Add an SVG/PNG image (logo/marking) to the board',
  'Görsel eklendi': 'Image added',
  'Görsel eklemek için PCB moduna geçin': 'Switch to PCB mode to add an image',
  'Görseli yerleştirmek için karta tıklayın (Esc: iptal)':
    'Click on the board to place the image (Esc: cancel)',
  'Görseli yerleştirmek için karta tıklayın — Esc: iptal':
    'Click on the board to place the image — Esc: cancel',
  'Opaklık': 'Opacity',
  'Aynala (yatay)': 'Mirror (horizontal)',
  'En-boy oranını kilitle': 'Lock aspect ratio',

  // ── Yeni: kullanıcı kütüphanesi ──
  'Kullanıcı Kütüphanem': 'My Library',
  'Kullanıcı kütüphanem': 'my library',
  'Kullanıcı kütüphanem ({n})': 'My library ({n})',
  'kullanıcı kütüphanesi': 'user library',
  'Kategori adı': 'Category name',
  'Yeni kategori oluştur': 'Create new category',
  'Bu kategoriyi sil (içindekiler Genel\'e taşınır)':
    'Delete this category (its items move to General)',
  'Kategoriyi sil (içindekiler Genel\'e taşınır)':
    'Delete category (its items move to General)',
  'Kategoriye taşı': 'Move to category',
  'Modüller': 'Modules',
  'Konnektörler': 'Connectors',
  'Güç': 'Power',
  '"{cat}" kategorisi silindi': 'Category "{cat}" deleted',
  '"{cat}" kategorisini sil?': 'Delete category "{cat}"?',
  'İçindeki {n} komponent "Genel" kategorisine taşınacak. Emin misiniz?':
    'Its {n} components will move to the "General" category. Are you sure?',
  'Bu kategori silinecek. Emin misiniz?': 'This category will be deleted. Are you sure?',
  '"{cat}" kategorisi silindi — komponentleri Genel\'e taşındı':
    'Category "{cat}" deleted — its components moved to General',
  'Yeni (boş)': 'New (blank)',
  'Yeni boş footprint\'e geç': 'Switch to a new blank footprint',
  'Kaydedildi': 'Saved',
  'yeni': 'new',
  'Komponent kullanıcı kütüphanesinden silindi': 'Component removed from user library',
  'Kopyalayıp düzenle': 'Copy & edit',
  'Otomatik kayıt': 'Auto-saved',
  'PC kütüphanesi': 'PC library',
  'Henüz kendi komponentiniz yok. "＋ Yeni" ile oluşturun; otomatik kaydedilir.':
    'You have no components yet. Create one with "＋ New"; it saves automatically.',
  'Değişiklikler otomatik kaydedilir ve PC\'de/tarayıcıda kalıcıdır. Kaydedince bu footprint\'i düzenlemeye devam edersiniz.':
    'Changes save automatically and persist on PC/browser. After saving you keep editing this footprint.',
  '"{name}" kütüphaneye kaydedildi (otomatik) — {cat} kategorisi':
    '"{name}" saved to library (automatic) — {cat} category',
  '"{name}" güncellendi — DİKKAT: {n} komponent yeni pad düzenine uymadığı için karttan kaldırıldı':
    '"{name}" updated — WARNING: {n} component(s) removed from the board because they no longer match the new pad layout',
  '"{name}" güncellendi — karttaki {n} eski pad net ataması temizlendi':
    '"{name}" updated — cleared {n} stale pad net assignment(s) on the board',
  '{n} footprint kullanıcı kütüphanesine aktarıldı (otomatik kayıtlı)':
    '{n} footprints imported to user library (auto-saved)',
  '{n} komponent dışa aktarıldı (.cayalib)': '{n} components exported (.cayalib)',
  'Kullanıcı komponentlerini dışa aktar (.cayalib)': 'Export user components (.cayalib)',
  'Dışa aktarılacak komponent yok — önce Footprint editörüyle oluşturun':
    'No components to export — create some with the Footprint editor first',

  // ── Yeni: kart editörü ──
  'Kart Editörü': 'Board Editor',
  'Kart modu — kart dış hattını ölçülü, profesyonel biçimde düzenleyin':
    'Board mode — edit the board outline precisely and professionally',
  'Kart dış hattını ölçülü, profesyonel biçimde düzenleyin':
    'Edit the board outline precisely and professionally',
  'Kesim (kare)': 'Cutout (rect)',
  'Kesim (daire)': 'Cutout (circle)',
  'Dikdörtgen kesim/şekil ekle': 'Add rectangular cutout/shape',
  'Daire kesim/delik ekle': 'Add circular cutout/hole',
  'Seç / köşe düzenle': 'Select / edit vertices',
  'Ölçüler': 'Dimensions',
  'PCB içeriğini göster': 'Show PCB content',
  'Kart ayarları': 'Board settings',
  'Montaj deliği ekle': 'Add mounting hole',
  'Montaj deliği çapı (mm)': 'Mounting hole diameter (mm)',
  'Montaj deliği eklendi': 'Mounting hole added',
  'Montaj deliği': 'Mounting hole',
  'Montaj deliği silindi': 'Mounting hole deleted',
  'Delik güncellendi': 'Hole updated',
  'Delik çapı güncellendi': 'Hole diameter updated',
  'Deliği sil': 'Delete hole',
  'Köşe R': 'Corner R',
  'Köşe': 'Corner',
  'Yuvarlatma R (mm)': 'Fillet R (mm)',
  'Köşe R (mm)': 'Corner R (mm)',
  'Çap (mm)': 'Diameter (mm)',
  'Köşeyi sil': 'Delete corner',
  'Kesimi sil': 'Delete cutout',
  'Dikdörtgen kesim': 'Rectangle cutout',
  'Daire kesim': 'Circle cutout',
  'Dikdörtgen kesim eklendi': 'Rectangle cutout added',
  'Daire kesim eklendi': 'Circle cutout added',
  'Kesim silindi': 'Cutout deleted',
  'Kesim güncellendi': 'Cutout updated',
  'Kesim ölçüsü güncellendi': 'Cutout dimension updated',
  'Kart köşe noktası silindi': 'Board vertex deleted',
  'Kart köşe noktası eklendi': 'Board vertex added',
  'Köşe konumu güncellendi': 'Vertex position updated',
  'Köşe yuvarlatma güncellendi': 'Corner fillet updated',
  'Köşe yuvarlatma {v} mm': 'Corner fillet {v} mm',
  'Kenar uzunluğu {v} mm': 'Edge length {v} mm',
  'Kart genişliği {v} mm': 'Board width {v} mm',
  'Kart yüksekliği {v} mm': 'Board height {v} mm',
  'Çift tık: köşe ekle/sil · Sürükle: taşı · Shift: hizalı · Ölçüye tıkla: sayısal değiştir':
    'Double-click: add/remove vertex · Drag: move · Shift: aligned · Click a dimension: edit numerically',
  'Çift tık: köşe ekle/sil · Sürükle: taşı · Deliğe tıkla: düzenle/sil (Del) · Shift: hizalı · Ölçüye tıkla: sayısal değiştir':
    'Double-click: add/remove vertex · Drag: move · Click a hole: edit/delete (Del) · Shift: aligned · Click a dimension: edit numerically',

  // ── 3B görünüm ──
  'İzometrik görünüm': 'Isometric view',
  'İzometrik': 'Isometric',
  'Üstten görünüm': 'Top view',
  'Alttan görünüm': 'Bottom view',
  'Önden görünüm': 'Front view',
  'Ön': 'Front',
  'Bileşenler': 'Components',
  'Modeller': 'Models',
  '3D Model': '3D Model',
  'OBJ/STL 3B model içe aktar': 'Import an OBJ/STL 3D model',
  '3B Modeller': '3D Models',
  'Ölçek': 'Scale',
  'Renk': 'Color',
  'Dönüş (Z°)': 'Rotation (Z°)',
  'OBJ ve STL desteklenir. Model kartın üstüne oturur; ölçek/dönüş/konumu ayarlayın.':
    'OBJ and STL supported. The model rests on the board; adjust scale/rotation/position.',
  '3B model içe aktarıldı: {name}': '3D model imported: {name}',
  '3B model içe aktarılamadı: {err}': 'Could not import 3D model: {err}',
  '3B model kaldırıldı': '3D model removed',
  'İzler': 'Traces',
  'Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık/Boşluk+sürükle: kaydır':
    'Drag: rotate · Wheel: zoom · Right-click/Space+drag: pan',
  'Tıkla: seç · Sürükle: döndür · Tekerlek: yakınlaştır · Sağ tık/Boşluk+sürükle: kaydır':
    'Click: select · Drag: rotate · Wheel: zoom · Right-click/Space+drag: pan',
  'Seçimi temizle': 'Clear selection',

  // ── Yeni: ızgara ──
  'Görünüm': 'View',
  'Pad adı etiketleri': 'Pad name labels',
  'Uzaklaşınca pad adları pad içinde okunmaz; bu seçenek adları pad\'in yanında hizalı ve üst üste binmeden gösterir.':
    'When zoomed out, pad names inside the pad are unreadable; this shows names beside the pad, aligned and without overlap.',
  'Kapalı (yalnız pad içi)': 'Off (inside pad only)',
  'Uzaklaşınca yanında (varsayılan)': 'Beside when zoomed out (default)',
  'Her zaman yanında': 'Always beside',
  // ── Silk pin adları / pin gösterim modu ──
  'Silk pin adları': 'Silk pin names',
  'Her pad\'in adı/numarası silkscreen katmanında pad\'in içine yazı olarak çizilir ve tüm silk dışa aktarımlarına (Gerber/SVG/PNG) dahil edilir. Yerleşik ve kullanıcı footprint\'lerinin hepsinde otomatiktir. Pinlerin varsayılan gösterimidir. Varsayılan: açık':
    'Each pad\'s name/number is drawn as text inside the pad on the silkscreen layer and included in all silk exports (Gerber/SVG/PNG). Automatic for all built-in and user footprints. This is the default pin display. Default: on',
  'Editör pin adları (ekran üstü)': 'Editor pin names (on-screen overlay)',
  'Yalnız ekranda görünen (dışa aktarılmayan) pad adı kaplaması. Silk pin adlarından ayrıdır; ekstra bir "editör görünümü" olarak istenirse açılır. Varsayılan: kapalı (yalnız pad içi).':
    'On-screen-only (not exported) pad name overlay. Separate from silk pin names; enable as an extra "editor view" if desired. Default: off (inside pad only).',
  'Kapalı (yalnız pad içi, varsayılan)': 'Off (inside pad only, default)',
  'Pad\'e yakınlaşınca adı pad içinde de göster': 'Also show name inside pad when zoomed in',
  'Silk pin adları açıkken, pad\'e yeterince yakınlaşıldığında ad silk yazısına ek olarak pad\'in içinde de gösterilir. Kapalıysa yalnızca silk yazısı (pad yanı) görünür. Varsayılan: açık':
    'While silk pin names are on, zooming in close enough also shows the name inside the pad, in addition to the silk text. When off, only the silk text (beside the pad) is shown. Default: on',
  'Uzaklaşınca yanında': 'Beside when zoomed out',
  'Pin adı gösterimi: silk (üretim), editör (ekran kaplaması) veya ikisi':
    'Pin name display: silk (production), editor (screen overlay), or both',
  'Pin adı gösterimi: silk (pad yanı, üretim), editör (ekran kaplaması) veya kapalı (yalnız yaklaşınca pad içinde)':
    'Pin name display: silk (beside pad, production), editor (screen overlay), or off (only inside pad when zoomed in)',
  'Silk (üretim)': 'Silk (production)',
  'Editör (ekran)': 'Editor (screen)',
  'İkisi': 'Both',
  'Özel footprint etiket konumuna öncelik ver': 'Prioritize custom footprint label position',
  'Kullanıcı tanımlı footprint\'lerde footprint editöründe elle taşınmış pad adı varsa PCB\'de de aynı konumda gösterilir. Kapalıysa PCB her zaman otomatik/simetrik yerleşimi kullanır. Yerleşik footprint\'leri etkilemez. Varsayılan: açık':
    'For user-defined footprints, if a pad name was manually moved in the footprint editor, it is shown at that same position on the PCB. When off, the PCB always uses automatic/symmetric placement. Does not affect built-in footprints. Default: on',
  'Sığmayınca pin adlarını otomatik gizle': 'Auto-hide pin names when crowded',
  'Kart dışında gösterilen pin adları çakışacak veya kart dışına taşacak kadar sıkışırsa, o bileşenin tüm pin adları (özel konumlananlar dahil) birlikte gizlenir. Kapalıysa yer olmasa da her zaman gösterilir. Varsayılan: açık':
    'If pin name labels shown outside the board would overlap or overflow the board edge, all of that component\'s pin names (including custom-positioned ones) are hidden together. When off, they are always shown regardless of space. Default: on',
  'Izgara görünümü': 'Grid style',
  'Çizgi': 'Lines',
  'Nokta': 'Dots',
  'Kapalı': 'Off',

  // ── Yeni: sol araç şeridi ──
  'İzo': 'Iso',
  'Bileşen': 'Parts',
  'Model': 'Models',
  'Pin Adı': 'Pin Names',
  'Model Al': 'Import',
  'Bileşenleri göster/gizle': 'Show/hide components',
  'İzleri göster/gizle': 'Show/hide traces',
  'İçe aktarılan 3B modelleri göster/gizle': 'Show/hide imported 3D models',
  'Pin adlarını kart üstünde göster': 'Show pin names on the board',
  'Görünümü PNG olarak dışa aktar': 'Export view as PNG',
  'Sahneyi OBJ modeli olarak dışa aktar': 'Export scene as OBJ model',

  // ── Yeni: araç ipuçları (şema/kart) ──
  'Tel çizimi — pin ucuna tıklayıp başlayın, çift tık/Enter: bitir':
    'Wire drawing — click a pin end to start, double-click/Enter to finish',
  'Net atama — pin ucuna veya tele tıklayın': 'Assign net — click a pin end or a wire',
  'Silme — tel veya sembole tıklayın': 'Delete — click a wire or symbol',
  'Seçim — sembol/tel tıkla, sürükle, R: döndür, Del: sil':
    'Select — click/drag symbols & wires, R: rotate, Del: delete',
  'Dikdörtgen kesim/şekil — kart üstüne sürükleyin': 'Rectangular cutout — drag on the board',
  'Daire kesim — kart üstüne sürükleyin': 'Circular cutout — drag on the board',
  'Seç / köşe düzenle — köşe ve ölçüleri sürükleyin': 'Select / edit corners — drag vertices and dimensions',
  'Not: bu pin şemada bir tele bağlı — tel durdukça senkron neti yeniden atayabilir':
    'Note: this pin is connected to a schematic wire — sync may re-assign the net while the wire remains',

  // ── Yeni: 3B görünüm ──
  'Renkler': 'Colors',
  'Bileşen renkleri': 'Component colors',
  'Bileşen renklerini ayrı ayrı değiştir': 'Change component colors individually',
  'Varsayılan renge dön': 'Reset to default color',
  'Renk, footprint 3B modelinin/otomatik gövdenin rengini geçersiz kılar. PNG/OBJ dışa aktarımına yansır.':
    'The color overrides the footprint 3D model / auto body color. It is reflected in PNG/OBJ exports.',
  '3B görünüm PNG olarak dışa aktarıldı': '3D view exported as PNG',
  '3B sahne OBJ + MTL olarak dışa aktarıldı': '3D scene exported as OBJ + MTL',
  'Dışa aktarılamadı: {err}': 'Export failed: {err}',

  // ── Yeni: footprint editörü sekmeleri ──
  'Kılıf (PCB)': 'Land pattern (PCB)',
  'Şema Sembolü': 'Schematic Symbol',
  '3B Model': '3D Model',
  'Pad, etiket, silk ve köşeleri taşı — boşlukta sürükle: kaydır':
    'Move pads, labels, silk and vertices — drag empty space to pan',
  'Tıklayarak pad ekle': 'Click to add a pad',
  'Silkscreen çizgi çiz (sürükle)': 'Draw silkscreen line (drag)',
  'Silkscreen daire çiz (merkezden sürükle)': 'Draw silkscreen circle (drag from center)',
  'Silkscreen yazı ekle': 'Add silkscreen text',
  'Pad / silk öğesi / köşe sil': 'Delete pad / silk element / vertex',
  'Pad': 'Pad',
  'Dış hat': 'Outline',
  'Çerçeve': 'Frame',
  'Gövde ölçülerinden dikdörtgen çerçeve çiz': 'Draw rectangular frame from body dimensions',
  'Sığdır': 'Fit',
  'İçeriğe sığdır': 'Fit to content',
  'Örn: 1, A, +': 'e.g. 1, A, +',
  'Tekerlek: yakınlaştır · Sağ tık/boş alan sürükle: kaydır · Shift: ızgarasız hassas':
    'Wheel: zoom · Right-click/empty-area drag: pan · Shift: fine (no grid)',
  'Özelleştir': 'Customize',
  'Otomatik': 'Auto',
  'Pin ve çizimleri taşı · pine çift tık: yön değiştir':
    'Move pins and drawings · double-click pin: flip side',
  'Çizgi çiz (sürükle)': 'Draw line (drag)',
  'Dikdörtgen çiz (sürükle)': 'Draw rectangle (drag)',
  'Daire çiz (merkezden sürükle)': 'Draw circle (drag from center)',
  'Yazı ekle': 'Add text',
  'Çizim öğesi sil': 'Delete drawing element',
  'Otomatik sembole (kutu/standart glif) geri dön': 'Return to automatic symbol (box/standard glyph)',
  'Kutu': 'Box',
  'Sembol yazısı': 'Symbol text',
  'Örn: OPAMP, +, K': 'e.g. OPAMP, +, K',
  'Sarı noktalar pin uçlarıdır (tel buraya bağlanır) — sürükleyin, çift tıkla yön değiştirin. Pinler pad adlarıyla eşleşir.':
    'Yellow dots are pin ends (wires attach here) — drag them, double-click to flip side. Pins match pad names.',
  'Bu footprint şemada otomatik sembolle gösterilir. Özelleştir ile kendi çiziminizi yapın; kaydedince şemada kullanılır.':
    'This footprint uses an automatic schematic symbol. Use Customize to draw your own; it is used in the schematic once saved.',
  'Otomatik sembol — düzenlemek için "Özelleştir"e basın': 'Automatic symbol — press "Customize" to edit',
  'Basit şekil': 'Simple shape',
  'OBJ/STL model': 'OBJ/STL model',
  'Silindir': 'Cylinder',
  'Model seç': 'Choose model',
  'Dönüş': 'Rotation',
  '3B görünümde kategoriye göre otomatik basit gövde üretilir. Basit şekil veya OBJ/STL model atayabilirsiniz.':
    'The 3D view generates an automatic simple body by category. You can assign a simple shape or an OBJ/STL model.',
  'Sürükle: döndür · Tekerlek: yakınlaştır. Model kaydedilen footprint ile birlikte saklanır ve 3B görünümde kullanılır.':
    'Drag: rotate · Wheel: zoom. The model is stored with the footprint and used in the 3D view.',

  // ── Yeni: kaydedilmemiş değişiklik uyarıları ──
  'Kaydedilmemiş değişiklikler var': 'You have unsaved changes',
  'Devam ederseniz mevcut projedeki kaydedilmemiş değişiklikler kaybolur. Önce Kaydet\'e basabilirsiniz.':
    'If you continue, unsaved changes in the current project will be lost. You can press Save first.',
  'Mevcut projedeki ("{name}") kaydedilmemiş değişiklikler devam ederseniz KAYBOLUR. Kaydetmek için önce "Editöre geç" ile dönüp Kaydet\'e basın.':
    'Unsaved changes in the current project ("{name}") will be LOST if you continue. To save, go back with "Go to editor" and press Save first.',
  'Devam (kaydetme)': 'Continue (discard)',

  // ── Yeni: footprint editörü seçim/özellik ──
  'Kalınlık': 'Width',
  'Boyut': 'Size',
  'Sol': 'Left',
  'Sağ': 'Right',
  'Dolu': 'Filled',
  'Çokgen': 'Polygon',
  'Tekerlek: yakınlaştır · Sağ tık/boş alan sürükle: kaydır · Shift: ızgarasız hassas · Del: seçiliyi sil · Ctrl+Z: geri al':
    'Wheel: zoom · Right-click/empty-area drag: pan · Shift: fine (no grid) · Del: delete selection · Ctrl+Z: undo',
  'Sarı noktalar pin uçlarıdır (tel buraya bağlanır) — sürükleyin, çift tıkla yön değiştirin. Pinler pad adlarıyla eşleşir. Del: seçili çizimi sil':
    'Yellow dots are pin ends (wires attach here) — drag them, double-click to flip side. Pins match pad names. Del: delete selected drawing',

  // ── Yeni: tam kart SVG ──
  'Tam Kart — her şey dahil': 'Full Board — everything included',
  'Tam kart SVG': 'Full board SVG',
  'Dış çerçeve + yollar + pad\'ler + vialar + delikler + silkscreen yazılar — tek eksiksiz SVG':
    'Outline + traces + pads + vias + drills + silkscreen texts — one complete SVG'
}
