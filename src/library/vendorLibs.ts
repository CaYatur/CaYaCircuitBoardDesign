// ─── SparkFun & Adafruit kütüphaneleri ────────────────────────────────────
// SparkFun ve Adafruit ekosisteminin İMZA konnektörleri — gerçek JST datasheet
// / yaygın açık kaynak (KiCad/Eagle) ölçülerine dayanır. KAPSAM dürüstçe
// sınırlıdır: yalnızca ölçüsünden emin olduğumuz, çok kullanılan parçalar
// (Qwiic / STEMMA QT = JST-SH 1.0mm 4 pin, STEMMA / LiPo = JST-PH 2.0mm).
// Uydurma ölçü yok — bilinmeyen parçalar eklenmedi (yanlış footprint, eksik
// footprint'ten kötüdür).

import type { Footprint, PadDef, SilkElement } from '../types'

const rect = (x: number, y: number, w: number, h: number, width = 0.12): SilkElement[] => [
  { kind: 'line', x1: x, y1: y, x2: x + w, y2: y, width },
  { kind: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h, width },
  { kind: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h, width },
  { kind: 'line', x1: x, y1: y + h, x2: x, y2: y, width }
]

const smd = (name: string, x: number, y: number, w: number, h: number): PadDef => ({
  name, x, y, shape: 'rect', width: w, height: h, layer: 'top'
})

const tht = (name: string, x: number, y: number, dia = 1.6, drill = 0.7, square = false): PadDef => ({
  name, x, y, shape: square ? 'rect' : 'circle', width: dia, height: dia, drill, layer: 'both'
})

/**
 * JST-SH 1.0mm 4 pin, yatay SMD (SM04B-SRSS-TB) — Qwiic / STEMMA QT.
 * Ölçüler KiCad "JST_SH_SM04B-SRSS-TB" footprint'inden: sinyal pad 0.6×1.55,
 * pitch 1.0mm; iki mekanik tutucu tab 1.2×1.8. Pinout (Qwiic): 1=GND 2=3V3
 * 3=SDA 4=SCL.
 */
function shQwiic(id: string, name: string, description: string, category: string, label: string): Footprint {
  const pads: PadDef[] = [
    ...(['1', '2', '3', '4'].map((n, i) => smd(n, -1.5 + i * 1.0, 1.3, 0.6, 1.55)) as PadDef[]),
    smd('M1', -2.8, -0.6, 1.2, 1.8),
    smd('M2', 2.8, -0.6, 1.2, 1.8)
  ]
  return {
    id,
    name,
    description,
    category,
    pads,
    silk: [
      ...rect(-2.13, -1.55, 4.26, 3.1, 0.12),
      { kind: 'text', x: 0, y: -0.2, text: label, size: 0.7 },
      // 1. pin işareti
      { kind: 'circle', cx: -1.5, cy: 2.35, r: 0.2, width: 0.12 }
    ],
    body: { x: -3.0, y: -1.7, width: 6.0, height: 4.0 }
  }
}

/**
 * JST-PH 2.0mm THT konnektör (B*B-PH-K) — n pin.
 * Ölçüler JST PH datasheet: pitch 2.0mm, delik 0.7mm, pad ~1.6mm; gövde
 * derinliği ~4.5mm. 1. pin kare pad.
 */
function jstPh(id: string, name: string, description: string, category: string, pins: number): Footprint {
  const pitch = 2.0
  const startX = -((pins - 1) * pitch) / 2
  const pads = Array.from({ length: pins }, (_, i) =>
    tht(`${i + 1}`, startX + i * pitch, 0, 1.6, 0.7, i === 0)
  )
  const bw = pins * pitch + 1.0
  const bx = startX - 1.0
  return {
    id,
    name,
    description,
    category,
    pads,
    silk: [
      ...rect(bx, -2.9, bw, 6.4, 0.15),
      { kind: 'line', x1: bx, y1: 0.6, x2: bx + bw, y2: 0.6, width: 0.12 }
    ],
    body: { x: bx, y: -2.9, width: bw, height: 6.4 }
  }
}

export const sparkfunFootprints: Footprint[] = [
  shQwiic(
    'sf-qwiic-sh04',
    'Qwiic Konnektör (JST-SH 4)',
    'SparkFun Qwiic I²C — JST-SH 1.0mm 4 pin, yatay SMD. Pinout: 1=GND 2=3.3V 3=SDA 4=SCL',
    'SparkFun',
    'Qwiic'
  ),
  jstPh(
    'sf-jst-ph2',
    'JST-PH 2 pin (LiPo)',
    'SparkFun LiPo pil / güç girişi — JST-PH 2.0mm 2 pin, THT',
    'SparkFun',
    2
  ),
  jstPh(
    'sf-jst-ph3',
    'JST-PH 3 pin',
    'SparkFun JST-PH 2.0mm 3 pin konnektör, THT',
    'SparkFun',
    3
  )
]

export const adafruitFootprints: Footprint[] = [
  shQwiic(
    'af-stemma-qt-sh04',
    'STEMMA QT (JST-SH 4)',
    'Adafruit STEMMA QT I²C — JST-SH 1.0mm 4 pin, yatay SMD (Qwiic uyumlu). Pinout: 1=GND 2=3.3V 3=SDA 4=SCL',
    'Adafruit',
    'QT'
  ),
  jstPh(
    'af-stemma-ph3',
    'STEMMA (JST-PH 3)',
    'Adafruit STEMMA 3 pin — JST-PH 2.0mm, THT',
    'Adafruit',
    3
  ),
  jstPh(
    'af-stemma-ph4',
    'STEMMA I²C (JST-PH 4)',
    'Adafruit STEMMA I²C — JST-PH 2.0mm 4 pin, THT',
    'Adafruit',
    4
  ),
  jstPh(
    'af-jst-ph2',
    'JST-PH 2 pin (LiPo)',
    'Adafruit LiPo pil konnektörü — JST-PH 2.0mm 2 pin, THT',
    'Adafruit',
    2
  )
]
