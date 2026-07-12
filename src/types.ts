// ─── CaYa PCB Studio — Çekirdek Veri Modeli ───────────────────────────────
// Tüm koordinatlar milimetre (mm) cinsindendir. Y ekseni ekranda aşağı doğru
// pozitiftir; Gerber/G-code dışa aktarımında çevrilir.

export type CopperLayer = 'top' | 'bottom'
export type PadLayer = CopperLayer | 'both' // 'both' = delikli (through-hole)

export type Rotation = 0 | 90 | 180 | 270

export interface Point {
  x: number
  y: number
}

// ─── Footprint (kılıf/ayak izi) tanımı ────────────────────────────────────

export type PadShape = 'circle' | 'rect' | 'oval'

export interface PadDef {
  /** Pin adı/numarası: "1", "GND", "VCC" gibi */
  name: string
  /** Footprint yerel koordinatları (mm, merkez) */
  x: number
  y: number
  shape: PadShape
  width: number
  height: number
  /** Delik çapı (mm) — varsa through-hole pad */
  drill?: number
  /** Sarı pad bakırının siyah delik merkezine göre kayması (mm). Varsayılan 0.
   *  Pad'in x/y konumu deliği belirler; bu alan yalnızca sarı halkayı taşır.
   *  Kısa devre/kenar dışına taşma riskine karşı editörde pad sınırlarına
   *  kırpılır. */
  holeDx?: number
  holeDy?: number
  layer: PadLayer
  /** Pad adı etiketinin pad merkezine göre kayması (mm) — footprint editöründe
   *  ad, gövde çizgilerine binmesin diye taşınabilir (issue 11) */
  nameDx?: number
  nameDy?: number
}

export interface SilkLine {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
}

export interface SilkCircle {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  width: number
}

/** Yay (örn. kondansatör polarite işareti gibi kıvrık silk çizimleri) */
export interface SilkArc {
  kind: 'arc'
  cx: number
  cy: number
  r: number
  /** Başlangıç/bitiş açısı (radyan) — canvas arc yönünde a0'dan a1'e sarar */
  a0: number
  a1: number
  width: number
}

export interface SilkText {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
}

export type SilkElement = SilkLine | SilkCircle | SilkArc | SilkText

// ─── Özel şema sembolü (footprint başına) ─────────────────────────────────

/** Şema sembolü çizim ilkeli (sembol yerel koordinatları, şema mm birimi) */
export type SymbolPrim =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number }
  | { k: 'poly'; pts: Point[]; close?: boolean; fill?: boolean; w?: number }
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: boolean; w?: number }
  | { k: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; w?: number }
  | { k: 'plusminus'; x: number; y: number; s: number; minus?: boolean }
  | { k: 'text'; x: number; y: number; text: string; size?: number }

/** Özel sembol pini: adı pad adıyla eşleşir; (x,y) tel bağlantı ucudur */
export interface SymbolPinDef {
  name: string
  x: number
  y: number
  side: 'left' | 'right'
}

/**
 * Footprint'e özel şema sembolü. Tanımlıysa otomatik kutu/standart glif yerine
 * bu çizim kullanılır; pin uçları net senkronu ve tel yakalama için otomatik
 * yerleşimle birebir aynı mekanizmada çalışır.
 */
export interface SymbolDef {
  pins: SymbolPinDef[]
  prims: SymbolPrim[]
  /** Gövde kutusu (isabet testi/etiket konumu). Yoksa çizimden hesaplanır */
  box?: { x: number; y: number; width: number; height: number }
}

// ─── Footprint 3B modeli ──────────────────────────────────────────────────

/**
 * Footprint'e bağlı 3B gösterim. Tanımlı değilse kategoriye göre otomatik
 * basit bir katı cisim üretilir (kutu/silindir).
 *  - 'param': basit parametrik şekil (kutu/silindir) + yükseklik + renk
 *  - 'mesh' : içe aktarılmış OBJ/STL örgüsü (footprint-yerel, XY merkezli)
 */
export interface FootprintModel3D {
  kind: 'param' | 'mesh'
  /** param: gövde şekli */
  shape?: 'box' | 'cyl'
  /** param: gövde yüksekliği (mm) */
  height?: number
  /** Gövde rengi (hex) — param ve mesh için */
  color?: string
  /** mesh: üçgen köşe koordinatları düz dizi (x,y,z,...) */
  verts?: number[]
  /** mesh: üçgen indeksleri */
  tris?: number[]
  /** mesh: ölçek çarpanı */
  scale?: number
  /** mesh: Z ekseni dönüşü (derece) */
  rotZ?: number
  /** mesh: kart yüzeyinden yükseklik ofseti (mm) */
  z?: number
  /** mesh: kaynak dosya adı */
  name?: string
  /** Modelin üstüne "yazılmış" düz (2B) metin etiketleri — footprint-yerel
   *  konum, kart/komponent yüzüne göre otomatik döner/aynalanır */
  labels?: FootprintModelLabel[]
}

export interface FootprintModelLabel {
  text: string
  /** Footprint-yerel konum (mm) — pad/silk ile aynı çerçevede */
  x: number
  y: number
  /** Kart yüzeyinden yükseklik ofseti (mm) — model üstüne oturması için */
  z?: number
  /** Yazı yüksekliği (mm) */
  size?: number
  color?: string
  /** Etiketin kendi ekseni etrafındaki dönüşü (derece) */
  rotZ?: number
}

export interface Footprint {
  id: string
  name: string
  description: string
  /** Kategori: 'Mikrodenetleyici', 'Pasif', 'Konnektör'... */
  category: string
  pads: PadDef[]
  silk: SilkElement[]
  /** Gövde sınır kutusu (mm) — yerleşim/çakışma kontrolü için */
  body: { x: number; y: number; width: number; height: number }
  /** Elle çizilmiş gövde/dış hat poligonu (footprint-yerel mm). Varsa footprint
   *  editöründe yeniden düzenlenir; silk çizgileri bundan üretilir (issue 12) */
  outline?: Point[]
  /** Özel şema sembolü (footprint editöründe tasarlanır) */
  symbol?: SymbolDef
  /** Özel 3B model (footprint editöründe atanır/oluşturulur) */
  model3d?: FootprintModel3D
  /** Kullanıcı tanımlı mı (özel footprint editörüyle oluşturulmuş) */
  custom?: boolean
}

// ─── Kart üstündeki nesneler ──────────────────────────────────────────────

export interface ComponentInstance {
  id: string
  footprintId: string
  /** Referans: R1, C3, U2... */
  refDes: string
  /** Değer: 10k, 100nF, ATmega328 */
  value: string
  x: number
  y: number
  rotation: Rotation
  /** Kartın hangi yüzünde */
  side: CopperLayer
  /** Pad adı → net adı eşlemesi */
  padNets: Record<string, string>
  /** 3B görünümde gövde rengi (hex) — footprint/otomatik rengi geçersiz kılar */
  color3d?: string
}

export interface TraceSegment {
  id: string
  layer: CopperLayer
  points: Point[]
  width: number
  net: string
}

export interface Via {
  id: string
  x: number
  y: number
  /** Dış bakır çapı */
  diameter: number
  drill: number
  net: string
}

/**
 * Yazı tipi / stili. Tümü üretim uyumlu tek-çizgi (stroke) vektör fontuyla
 * üretilir; Gerber/SVG/G-code dışa aktarımında birebir korunur.
 */
export type FontStyle = 'standard' | 'italic' | 'wide' | 'condensed' | 'script'

export const FONT_STYLES: { id: FontStyle; label: string }[] = [
  { id: 'standard', label: 'Standart' },
  { id: 'italic', label: 'İtalik' },
  { id: 'wide', label: 'Geniş' },
  { id: 'condensed', label: 'Dar' },
  { id: 'script', label: 'El yazısı' }
]

export interface TextItem {
  id: string
  layer: 'top-silk' | 'bottom-silk'
  x: number
  y: number
  text: string
  size: number
  rotation: Rotation
  /** Kalın yazı (çizgi kalınlığı artırılır) */
  bold?: boolean
  /** Yazı tipi / stili (varsayılan 'standard') */
  font?: FontStyle
}

// ─── Görsel (SVG/PNG) yerleştirme ─────────────────────────────────────────

/**
 * Karta yerleştirilen görsel (logo, işaret, dokümantasyon). Raster (PNG/JPG)
 * gömülü data URL olarak; vektör (SVG) ham metin olarak saklanır. Silkscreen
 * ve birleşik görsel/PDF dışa aktarımlarında çizilir.
 */
export interface ImageItem {
  id: string
  layer: 'top-silk' | 'bottom-silk'
  format: 'png' | 'svg'
  /** PNG için data URL (data:image/png;base64,...), SVG için data URL veya ham */
  src: string
  x: number
  y: number
  /** Görsel genişlik/yükseklik (mm) */
  width: number
  height: number
  rotation: Rotation
  /** 0..1 opaklık */
  opacity: number
  /** Ayna (alt yüz için) */
  mirror?: boolean
  /** Kilitli (yanlışlıkla taşımaya karşı) */
  locked?: boolean
}

/**
 * İçe aktarılmış harici 3B model (OBJ/STL). 3B görünümde kartın üstüne
 * yerleştirilir ve konum/ölçek/dönüş ile ayarlanır (issue 2).
 */
export interface Model3D {
  id: string
  name: string
  /** Üçgen köşe koordinatları düz dizi (x,y,z,...) — yerel, XY merkezli, minZ=0 */
  verts: number[]
  /** Üçgen köşe indeksleri (i0,i1,i2,...) */
  tris: number[]
  /** Kart üzerinde konum (mm) */
  x: number
  y: number
  /** Kart üst yüzünden yükseklik ofseti (mm) */
  z: number
  /** Z ekseni etrafında dönüş (derece) */
  rotZ: number
  /** Ölçek çarpanı */
  scale: number
  /** Renk (hex) */
  color: string
  /** Görünür mü */
  visible: boolean
}

/**
 * Bakır dolgu alanı (copper pour/zone). Sınır serbest bir çokgendir; gerçek
 * dolgu şekli (`core/zoneFill.ts computeZoneFill`) bu sınırdan otomatik
 * üretilir: farklı netteki pad/via/iz'lerin çevresi `clearance` kadar
 * boşaltılır, aynı netteki THT pad/via'lara ısı yalıtım (thermal relief)
 * köprüleri eklenir.
 */
export interface CopperZone {
  id: string
  layer: CopperLayer
  /** Serbest çokgen sınır (kart-yerel mm) */
  points: Point[]
  net: string
  /** Diğer netlere olan boşluk */
  clearance: number
  /** THT pad/via'larda ısı yalıtım köprüsü (varsayılan açık) */
  thermalRelief?: boolean
  /**
   * Aynı netteki pad/via'nın alana bağlanma biçimi:
   *  'thermal' = ısı yalıtım köprüleri (spoke/X) — lehimlemesi kolay (varsayılan)
   *  'solid'   = doğrudan katı bakır dolgu (tam bağlantı, ısı yalıtımı yok)
   */
  connectStyle?: 'thermal' | 'solid'
  /** Isı yalıtım halkasının (pad çevresi boşluk) genişliği (mm). Varsayılan 0.5 */
  thermalGap?: number
  /** Isı yalıtım köprüsü (spoke) genişliği (mm). Varsayılan otomatik (pad'e göre) */
  spokeWidth?: number
  /** Köprü (spoke) sayısı: 2 veya 4. Varsayılan 4 */
  spokeCount?: 2 | 4
  /**
   * Köprü genişliğinin pad boyutuna göre otomatik küçültülmesini kapatır
   * (gelişmiş). Kapalıyken girilen spokeWidth aynen kullanılır — kısa devre
   * riskine karşı yabancı-net boşluğu yine de köprülerden sonra yeniden oyulur.
   */
  spokeUnclamped?: boolean
}

// ─── Kart ve proje ────────────────────────────────────────────────────────

export type BoardShape = 'rect' | 'circle' | 'oval' | 'polygon'

/** Kart içi kesim / eklenen mekanik şekil (delik, yuva, pencere) */
export interface BoardCutout {
  id: string
  shape: 'rect' | 'circle'
  /** rect: sol-üst köşe (mm); circle: merkez (mm) */
  x: number
  y: number
  /** rect: genişlik; circle: çap (2·yarıçap) */
  width: number
  /** rect: yükseklik; circle: kullanılmaz */
  height: number
  /** rect köşe yuvarlatma yarıçapı (mm) */
  cornerRadius?: number
}

export interface BoardOutline {
  /** Kart dış hat şekli */
  shape: BoardShape
  /** Sınır kutusu (mm) — tüm şekiller için bbox olarak korunur (görünüm sığdırma, dışa aktarım ölçüleri vb.) */
  width: number
  height: number
  /** Köşe yuvarlatma yarıçapı (mm) — yalnız 'rect' şeklinde kullanılır */
  cornerRadius: number
  /** Serbest çizim (polygon) köşe noktaları — yalnız shape==='polygon' iken dolu, (0,0) kökenli */
  points?: Point[]
  /** Serbest çizim köşe yuvarlatma yarıçapları (points ile paralel; yoksa 0). Kart editöründe düzenlenir */
  vertexRadii?: number[]
  /** İç kesimler / eklenen mekanik şekiller (delik, yuva, pencere) */
  cutouts?: BoardCutout[]
  /** Montaj delikleri */
  mountingHoles: { x: number; y: number; drill: number }[]
  /** Bakır katman sayısı: 1 = tek yüz (yalnız üst), 2 = çift yüz */
  layerCount: 1 | 2
  /** Lehim maskesi (PCB) rengi — hex. Görünüm ve renkli dışa aktarımlarda kullanılır */
  color?: string
  /**
   * Kart dış hattı çizgi kalınlığı (mm). Siyah-beyaz dış hat dışa aktarımında
   * ve editör/önizlemede kartın dış kenarı bu kalınlıkta çizilir. (Varsayılan 0.3)
   */
  outlineWidth?: number
}

/** Kart (lehim maskesi) renk ön ayarları */
export const PCB_COLORS: { name: string; value: string }[] = [
  { name: 'Yeşil', value: '#1a5c2a' },
  { name: 'Kırmızı', value: '#7a1f1f' },
  { name: 'Mavi', value: '#133a6b' },
  { name: 'Siyah', value: '#1a1a1a' },
  { name: 'Beyaz', value: '#c9cdd2' },
  { name: 'Mor', value: '#3a1a5c' },
  { name: 'Sarı', value: '#6f6a1a' },
  { name: 'Turkuaz', value: '#0e5b57' }
]

export const DEFAULT_PCB_COLOR = '#1a5c2a'

export interface DesignRules {
  /** Minimum iz genişliği (mm) */
  minTraceWidth: number
  /** Bakır-bakır minimum boşluk (mm) */
  clearance: number
  /** Minimum via delik çapı */
  minViaDrill: number
  /** Via dış çap / delik oranı için min halka */
  minAnnularRing: number
  /** Kart kenarına minimum mesafe */
  edgeClearance: number
  /** Bakır kalınlığı (oz/ft², hesaplamalar için) */
  copperWeightOz: number
}

/**
 * Bağlantı takibi (rubber-band) ayarları. Komponent/via/iz taşınırken ona
 * bağlı iz ve tel uçlarının konumu korunur; bağlantı kopmaz.
 */
export interface ConnectionFollowSettings {
  /** Ana anahtar — kapalıysa eski davranış (bağlantılar sabit kalır) */
  enabled: boolean
  /**
   * Kapsam:
   *  'endpoints' = yalnız pad/uç merkezine tam oturan iz uçları takip eder
   *  'all'       = pad'e herhangi bir yerinden değen tüm iz köşe noktaları takip eder
   */
  scope: 'endpoints' | 'all'
  /** İki noktanın "bağlı" sayıldığı mesafe toleransı (mm) */
  tolerance: number
  /** Komponente/pad'e oturan viaları da birlikte taşı */
  dragVias: boolean
  /** Taşıma bitince (anlık değil) bağlı izleri en az bozmayla düzelt */
  reflowOnDrop: boolean
}

export type GridStyle = 'lines' | 'dots' | 'off'

/**
 * Ölçüm/gösterim birimi. Depolama HER ZAMAN milimetredir; bu ayar yalnızca
 * ölçülerin ekranda gösterimini ve sayısal giriş yorumlamasını etkiler
 * (mm ↔ mil ↔ inç dönüşümü). 1 inç = 25.4 mm = 1000 mil.
 */
export type MeasureUnit = 'mm' | 'mil' | 'inch'

/**
 * Pad adı etiketlerinin görünümü (EDİTÖR üstü kaplama — silk pin etiketlerinden
 * ayrıdır):
 *  'off'        = pad adları yalnız pad içinde (yakınlaşınca) görünür (varsayılan)
 *  'zoomed-out' = uzaklaşınca adlar pad'in yanında hizalı gösterilir
 *  'always'     = adlar her zaman pad'in yanında hizalı gösterilir
 */
export type PadLabelMode = 'off' | 'zoomed-out' | 'always'

export interface ProjectSettings {
  gridSize: number
  snapToGrid: boolean
  /** Izgara görünümü: çizgi ızgara (varsayılan), nokta ızgara veya kapalı */
  gridStyle: GridStyle
  /**
   * Ölçü gösterim birimi (mm / mil / inç). Depolama daima mm; bu yalnızca
   * gösterim ve giriş yorumu içindir. (Varsayılan: 'mm')
   */
  units: MeasureUnit
  /** Pad adı etiketleri görünümü — EDİTÖR üstü kaplama (varsayılan: kapalı) */
  padLabelMode: PadLabelMode
  /**
   * Silk pin etiketleri: her pad'in adı/numarası silkscreen katmanında pad'in
   * içine yazı olarak çizilir ve tüm silk dışa aktarımlarına (Gerber/SVG/PNG)
   * dahil edilir. Yerleşik ve kullanıcı footprint'lerinin hepsinde otomatiktir.
   * Bu, pinlerin varsayılan gösterim biçimidir; editör üstü kaplama etiketleri
   * (padLabelMode) yalnızca istenirse açılır. (Varsayılan: AÇIK)
   */
  pinSilkLabels: boolean
  /**
   * Silk pin etiketleri açıkken, pad'e yeterince yakınlaşıldığında adın pad'in
   * İÇİNDE de (silk yazısına ek olarak) gösterilmesi. Kapalıysa yalnızca silk
   * yazısı (pad yanı) görünür, ad pad içinde tekrar edilmez. Silk pin etiketleri
   * kapalıyken bu ayarın bir etkisi yoktur — pad içi ad zaten her zaman gösterilir.
   * (Varsayılan: AÇIK)
   */
  pinSilkShowOnPad: boolean
  defaultTraceWidth: number
  defaultViaDiameter: number
  defaultViaDrill: number
  /** Yazı aracı varsayılan boyutu (mm) */
  defaultTextSize: number
  /** Yazı aracı varsayılan yazı tipi/stili */
  defaultTextFont: FontStyle
  /** Otorouter ızgara çözünürlüğü (mm) */
  autorouteResolution: number
  /** Otorouter via cezası (hücre birimi — yüksek değer daha az via) */
  autorouteViaCost: number
  /** Bağlantı takibi (varsayılan açık) */
  connectionFollow: ConnectionFollowSettings
  /** Uygulama kapatılırken kaydedilmemiş değişiklik uyarısı göster */
  warnOnUnsavedClose: boolean
  /**
   * PCB tarafında bir iz silindiğinde, yalnızca o iz sayesinde verilmiş net
   * atamalarını da temizle. Kapalıysa atamalar elle kaldırılır.
   * (Varsayılan: KAPALI — PCB'de iz silmek net atamasını korur)
   */
  clearNetsOnPathDeletePcb: boolean
  /**
   * Şema tarafında bir tel silindiğinde, yalnızca o tel sayesinde verilmiş net
   * atamalarını da temizle. (Varsayılan: AÇIK)
   */
  clearNetsOnPathDeleteSchematic: boolean
  /**
   * Şemada bir bağlantı değişince (tel eklenince/silinince/taşınınca) bir pinin
   * neti değişirse, o pine bağlı olan ESKİ nete ait PCB izlerini de kaldır.
   * Böylece şema ile PCB yönlendirmesi tutarlı kalır. (Varsayılan: AÇIK)
   */
  removePcbTracesOnSchematicChange: boolean
  /**
   * Şemada bileşenleri standart devre şeması sembolleriyle göster (direnç
   * zikzağı, kondansatör plakaları, diyot üçgeni vb.); kapalıysa hepsi kutu
   * sembolüdür. (Varsayılan: açık)
   */
  schematicStandardSymbols: boolean
  /**
   * Kullanıcı tanımlı (özel) footprint'lerde, footprint editöründe pad adı için
   * elle belirlenmiş konum (nameDx/nameDy) varsa PCB editöründe de aynen o
   * konumda gösterilsin. Kapalıysa PCB editörü her zaman otomatik/simetrik
   * yerleşimi kullanır. Yerleşik (hazır) footprint'lerde zaten elle konum
   * tanımlanmadığından bu ayar yalnızca kullanıcı footprint'lerini etkiler.
   * (Varsayılan: AÇIK)
   */
  padLabelRespectCustomFootprintPos: boolean
  /**
   * Kart dışında gösterilen pad adı etiketleri için yer kalmadığında (çakışma
   * veya kart dışına taşma) otomatik olarak gizle — özel footprint konumu
   * elle ayarlanmış pinler DAHİL, bir bileşenin TÜM etiketleri birlikte
   * gizlenir/gösterilir. Kapalıysa yer olmasa da etiketler her zaman gösterilir.
   * (Varsayılan: AÇIK)
   */
  padLabelAutoHideCrowded: boolean
}

// ─── Şematik ──────────────────────────────────────────────────────────────

export interface SchematicSymbol {
  /** PCB'deki komponentin kimliği */
  componentId: string
  x: number
  y: number
  rotation: Rotation
}

export interface SchematicWire {
  id: string
  points: Point[]
  /** Kullanıcının verdiği net adı (boşsa otomatik N$k atanır) */
  net: string
}

/**
 * Şema başlık bloğu (title block) — profesyonel devre şeması sayfasının
 * sağ-alt köşesindeki bilgi kutusu: başlık, revizyon, tasarımcı, tarih, sayfa
 * ve serbest açıklama notları. Sayfa çerçevesiyle birlikte hem ekranda hem
 * SVG/PNG dışa aktarımında çizilir.
 */
export interface TitleBlock {
  /** Başlık bloğu ve sayfa çerçevesi gösterilsin mi */
  enabled: boolean
  /** Proje/şema başlığı (boşsa proje adı kullanılır) */
  title: string
  /** Firma / kuruluş adı */
  company: string
  /** Tasarlayan (Design by) */
  author: string
  /** Revize eden (Revised by) */
  revisedBy: string
  /** Revizyon (REV) */
  revision: string
  /** Tarih (serbest metin, örn. 2026-07-12) */
  date: string
  /** Sayfa (örn. "1/1") */
  sheet: string
  /** Sayfa boyutu etiketi (A4/A3/Letter...) — yalnız bilgi amaçlı (etikette gösterilir) */
  size: string
  /** Çerçeve boyutlandırma modu: 'auto' = içeriğe göre otomatik sığdır (eski davranış), 'fixed' = pageWidth/pageHeight sabit boyutu kullan */
  sizeMode: 'auto' | 'fixed'
  /** Sabit sayfa genişliği (mm) — sizeMode:'fixed' iken kullanılır */
  pageWidth: number
  /** Sabit sayfa yüksekliği (mm) — sizeMode:'fixed' iken kullanılır */
  pageHeight: number
  /** Serbest açıklama notları (çok satırlı) */
  notes: string
}

export const defaultTitleBlock = (): TitleBlock => ({
  enabled: true,
  title: '',
  company: 'CaYaDev',
  author: '',
  revisedBy: '',
  revision: 'v1',
  date: new Date().toISOString().slice(0, 10),
  sheet: '1/1',
  size: 'A4',
  sizeMode: 'auto',
  pageWidth: 297,
  pageHeight: 210,
  notes: ''
})

/** Standart kağıt boyutları (mm, yatay/landscape) — Şema Bilgileri diyaloğunda seçilir */
export const STANDARD_SHEET_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
  Letter: { w: 279.4, h: 215.9 },
  Legal: { w: 355.6, h: 215.9 }
}

export interface SchematicData {
  symbols: SchematicSymbol[]
  wires: SchematicWire[]
  /** Başlık bloğu (title block) — sayfa bilgileri; yoksa varsayılan üretilir */
  titleBlock?: TitleBlock
  /**
   * Şema senkronunun EN SON yazdığı pin atamaları: "compId::pad" → net.
   * Tel silinip/taşınıp pin kopunca bayat atamayı güvenle temizlemek için
   * kullanılır (elle/PCB tarafında yapılmış atamalara dokunulmaz).
   */
  pinNets?: Record<string, string>
}

export interface Project {
  formatVersion: 1
  name: string
  createdAt: string
  modifiedAt: string
  board: BoardOutline
  components: ComponentInstance[]
  traces: TraceSegment[]
  vias: Via[]
  texts: TextItem[]
  zones: CopperZone[]
  /** Karta yerleştirilen görseller (logo/işaret) */
  images: ImageItem[]
  /** 3B görünümde içe aktarılmış harici modeller (OBJ/STL) */
  models3d?: Model3D[]
  /** Kullanıcının oluşturduğu özel footprint'ler projeyle birlikte saklanır */
  customFootprints: Footprint[]
  rules: DesignRules
  settings: ProjectSettings
  /** Şematik görünüm verisi */
  schematic: SchematicData
}

// ─── Editör durumu ────────────────────────────────────────────────────────

export type ToolId =
  | 'select'
  | 'trace'
  | 'via'
  | 'text'
  | 'zone'
  | 'measure'
  | 'net'
  | 'delete'
  | 'board-shape'

export type VisibleLayer =
  | 'top'
  | 'bottom'
  | 'top-silk'
  | 'bottom-silk'
  | 'drill'
  | 'outline'
  | 'ratsnest'
  | 'zones'

export interface Selection {
  componentIds: string[]
  traceIds: string[]
  viaIds: string[]
  textIds: string[]
  zoneIds: string[]
  imageIds: string[]
}

export const emptySelection = (): Selection => ({
  componentIds: [],
  traceIds: [],
  viaIds: [],
  textIds: [],
  zoneIds: [],
  imageIds: []
})

// ─── DRC ──────────────────────────────────────────────────────────────────

export type DrcSeverity = 'error' | 'warning'

export interface DrcViolation {
  id: string
  severity: DrcSeverity
  message: string
  x: number
  y: number
}

// ─── Varsayılanlar ────────────────────────────────────────────────────────

export const defaultRules = (): DesignRules => ({
  minTraceWidth: 0.25,
  clearance: 0.25,
  minViaDrill: 0.3,
  minAnnularRing: 0.15,
  edgeClearance: 0.3,
  copperWeightOz: 1
})

export const defaultConnectionFollow = (): ConnectionFollowSettings => ({
  enabled: true,
  scope: 'endpoints',
  tolerance: 0.05,
  dragVias: true,
  reflowOnDrop: true
})

export const defaultSettings = (): ProjectSettings => ({
  gridSize: 1.27,
  snapToGrid: true,
  gridStyle: 'lines',
  units: 'mm',
  padLabelMode: 'off',
  pinSilkLabels: true,
  pinSilkShowOnPad: true,
  defaultTraceWidth: 0.4,
  defaultViaDiameter: 0.8,
  defaultViaDrill: 0.4,
  defaultTextSize: 1.5,
  defaultTextFont: 'standard',
  autorouteResolution: 0.25,
  autorouteViaCost: 25,
  connectionFollow: defaultConnectionFollow(),
  warnOnUnsavedClose: true,
  clearNetsOnPathDeletePcb: false,
  clearNetsOnPathDeleteSchematic: true,
  removePcbTracesOnSchematicChange: true,
  schematicStandardSymbols: true,
  padLabelRespectCustomFootprintPos: true,
  padLabelAutoHideCrowded: true
})

export const newProject = (name = 'Yeni Proje'): Project => ({
  formatVersion: 1,
  name,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  board: {
    shape: 'rect',
    width: 100,
    height: 80,
    cornerRadius: 2,
    mountingHoles: [
      { x: 4, y: 4, drill: 3.2 },
      { x: 96, y: 4, drill: 3.2 },
      { x: 4, y: 76, drill: 3.2 },
      { x: 96, y: 76, drill: 3.2 }
    ],
    layerCount: 2,
    color: DEFAULT_PCB_COLOR,
    outlineWidth: 0.3
  },
  components: [],
  traces: [],
  vias: [],
  texts: [],
  zones: [],
  images: [],
  models3d: [],
  customFootprints: [],
  rules: defaultRules(),
  settings: defaultSettings(),
  schematic: { symbols: [], wires: [], titleBlock: defaultTitleBlock() }
})

let idCounter = 0
/** Benzersiz kimlik üretici */
export const uid = (prefix = 'e'): string =>
  `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`
