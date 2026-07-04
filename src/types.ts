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
  layer: PadLayer
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

export interface SilkText {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
}

export type SilkElement = SilkLine | SilkCircle | SilkText

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

/** Bakır dolgu alanı (basit dikdörtgen zone) */
export interface CopperZone {
  id: string
  layer: CopperLayer
  x: number
  y: number
  width: number
  height: number
  net: string
  /** Diğer netlere olan boşluk */
  clearance: number
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

export interface ProjectSettings {
  gridSize: number
  snapToGrid: boolean
  /** Izgara görünümü: çizgi ızgara (varsayılan), nokta ızgara veya kapalı */
  gridStyle: GridStyle
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

export interface SchematicData {
  symbols: SchematicSymbol[]
  wires: SchematicWire[]
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
  defaultTraceWidth: 0.4,
  defaultViaDiameter: 0.8,
  defaultViaDrill: 0.4,
  defaultTextSize: 1.5,
  defaultTextFont: 'standard',
  autorouteResolution: 0.25,
  autorouteViaCost: 25,
  connectionFollow: defaultConnectionFollow(),
  warnOnUnsavedClose: true
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
    color: DEFAULT_PCB_COLOR
  },
  components: [],
  traces: [],
  vias: [],
  texts: [],
  zones: [],
  images: [],
  customFootprints: [],
  rules: defaultRules(),
  settings: defaultSettings(),
  schematic: { symbols: [], wires: [] }
})

let idCounter = 0
/** Benzersiz kimlik üretici */
export const uid = (prefix = 'e'): string =>
  `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`
