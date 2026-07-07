// ─── Yerleşik Komponent Kütüphanesi ───────────────────────────────────────
// Tüm ölçüler mm cinsinden ve gerçek datasheet değerlerine dayanır
// (modüllerde küçük yaklaşıklıklar olabilir). Koordinat merkezi gövde
// merkezidir. Pin 1 kare pad ile işaretlenir.

import type { Footprint, PadDef, SilkElement } from '../types'

const P = 2.54 // standart pitch

// ─── Yardımcı üreteçler ───────────────────────────────────────────────────

const rectSilk = (
  x: number,
  y: number,
  w: number,
  h: number,
  width = 0.2
): SilkElement[] => [
  { kind: 'line', x1: x, y1: y, x2: x + w, y2: y, width },
  { kind: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h, width },
  { kind: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h, width },
  { kind: 'line', x1: x, y1: y + h, x2: x, y2: y, width }
]

const thtPad = (
  name: string,
  x: number,
  y: number,
  dia = 1.7,
  drill = 0.9,
  square = false
): PadDef => ({
  name,
  x,
  y,
  shape: square ? 'rect' : 'circle',
  width: dia,
  height: dia,
  drill,
  layer: 'both'
})

/** DIP kılıf üreteci (dar 7.62 / geniş 15.24 gövde) */
function dip(
  id: string,
  name: string,
  description: string,
  pinCount: number,
  rowSpacing = 7.62
): Footprint {
  const perSide = pinCount / 2
  const startY = -((perSide - 1) * P) / 2
  const pads: PadDef[] = []
  for (let i = 0; i < perSide; i++) {
    pads.push(thtPad(`${i + 1}`, -rowSpacing / 2, startY + i * P, 1.6, 0.8, i === 0))
  }
  for (let i = 0; i < perSide; i++) {
    pads.push(thtPad(`${pinCount - i}`, rowSpacing / 2, startY + i * P, 1.6, 0.8))
  }
  const bodyW = rowSpacing - 1.5
  const bodyH = perSide * P
  return {
    id,
    name,
    description,
    category: 'Entegre (IC)',
    pads,
    silk: [
      ...rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH),
      { kind: 'circle', cx: 0, cy: -bodyH / 2, r: 0.7, width: 0.2 } // çentik
    ],
    body: { x: -rowSpacing / 2 - 1, y: -bodyH / 2, width: rowSpacing + 2, height: bodyH }
  }
}

/** Tek/çift sıra pin header üreteci */
function header(
  id: string,
  name: string,
  description: string,
  cols: number,
  rows = 1
): Footprint {
  const pads: PadDef[] = []
  const startX = -((cols - 1) * P) / 2
  const startY = -((rows - 1) * P) / 2
  let pin = 1
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      pads.push(thtPad(`${pin}`, startX + c * P, startY + r * P, 1.7, 1.0, pin === 1))
      pin++
    }
  }
  const w = cols * P
  const h = rows * P
  return {
    id,
    name,
    description,
    category: 'Konnektör',
    pads,
    silk: rectSilk(-w / 2, -h / 2, w, h),
    body: { x: -w / 2, y: -h / 2, width: w, height: h }
  }
}

/** İki kenarı pinli geliştirme kartı / modül üreteci */
function twoRowModule(
  id: string,
  name: string,
  description: string,
  category: string,
  bodyW: number,
  bodyH: number,
  rowSpan: number,
  leftNames: string[],
  rightNames: string[],
  opts?: { holes?: { x: number; y: number; drill: number }[]; label?: string }
): Footprint {
  const pads: PadDef[] = []
  const n = leftNames.length
  const startY = -((n - 1) * P) / 2
  leftNames.forEach((pinName, i) => {
    pads.push(thtPad(pinName, -rowSpan / 2, startY + i * P, 1.7, 1.0, i === 0))
  })
  rightNames.forEach((pinName, i) => {
    pads.push(thtPad(pinName, rowSpan / 2, startY + i * P, 1.7, 1.0))
  })
  const silk: SilkElement[] = [
    ...rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH),
    { kind: 'text', x: 0, y: 0, text: opts?.label ?? name, size: 1.2 }
  ]
  const holePads: PadDef[] = (opts?.holes ?? []).map((h, i) => ({
    name: `MH${i + 1}`,
    x: h.x,
    y: h.y,
    shape: 'circle' as const,
    width: h.drill + 1.6,
    height: h.drill + 1.6,
    drill: h.drill,
    layer: 'both' as const
  }))
  return {
    id,
    name,
    description,
    category,
    pads: [...pads, ...holePads],
    silk,
    body: { x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH }
  }
}

/** 2 pad'li SMD çip (direnç/kondansatör/LED) */
function smdChip(
  id: string,
  name: string,
  description: string,
  category: string,
  padCenter: number,
  padW: number,
  padH: number,
  bodyW: number,
  bodyH: number
): Footprint {
  return {
    id,
    name,
    description,
    category,
    pads: [
      { name: '1', x: -padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' },
      { name: '2', x: padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' }
    ],
    silk: rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 0.15),
    body: { x: -padCenter - padW / 2, y: -Math.max(padH, bodyH) / 2, width: 2 * padCenter + padW, height: Math.max(padH, bodyH) }
  }
}

/** Eksenel (axial) THT parça: direnç, diyot */
function axial(
  id: string,
  name: string,
  description: string,
  category: string,
  pitch: number,
  bodyLen: number,
  bodyDia: number,
  polarized = false
): Footprint {
  const silk: SilkElement[] = [
    ...rectSilk(-bodyLen / 2, -bodyDia / 2, bodyLen, bodyDia),
    { kind: 'line', x1: -pitch / 2 + 0.8, y1: 0, x2: -bodyLen / 2, y2: 0, width: 0.2 },
    { kind: 'line', x1: bodyLen / 2, y1: 0, x2: pitch / 2 - 0.8, y2: 0, width: 0.2 }
  ]
  if (polarized) {
    // Katot bandı (pin 1 tarafı = katot)
    silk.push({ kind: 'line', x1: -bodyLen / 2 + 0.8, y1: -bodyDia / 2, x2: -bodyLen / 2 + 0.8, y2: bodyDia / 2, width: 0.4 })
  }
  return {
    id,
    name,
    description,
    category,
    pads: [
      thtPad(polarized ? 'K' : '1', -pitch / 2, 0, 1.6, 0.8, polarized),
      thtPad(polarized ? 'A' : '2', pitch / 2, 0, 1.6, 0.8)
    ],
    silk,
    body: { x: -pitch / 2 - 1, y: -bodyDia / 2, width: pitch + 2, height: bodyDia }
  }
}

/** Radyal elektrolitik kondansatör */
function radialCap(
  id: string,
  name: string,
  description: string,
  bodyDia: number,
  pitch: number
): Footprint {
  return {
    id,
    name,
    description,
    category: 'Kondansatör',
    pads: [
      thtPad('+', -pitch / 2, 0, 1.6, 0.8, true),
      thtPad('-', pitch / 2, 0, 1.6, 0.8)
    ],
    silk: [
      { kind: 'circle', cx: 0, cy: 0, r: bodyDia / 2, width: 0.2 },
      { kind: 'text', x: -bodyDia / 2 - 1.2, y: -bodyDia / 2, text: '+', size: 1.2 }
    ],
    body: { x: -bodyDia / 2, y: -bodyDia / 2, width: bodyDia, height: bodyDia }
  }
}

/** SOIC SMD kılıf üreteci */
function soic(id: string, name: string, description: string, pinCount: number): Footprint {
  const perSide = pinCount / 2
  const pitch = 1.27
  const rowSpan = 5.4
  const startY = -((perSide - 1) * pitch) / 2
  const pads: PadDef[] = []
  for (let i = 0; i < perSide; i++) {
    pads.push({
      name: `${i + 1}`,
      x: -rowSpan / 2, y: startY + i * pitch,
      shape: 'rect', width: 1.55, height: 0.6, layer: 'top'
    })
  }
  for (let i = 0; i < perSide; i++) {
    pads.push({
      name: `${pinCount - i}`,
      x: rowSpan / 2, y: startY + i * pitch,
      shape: 'rect', width: 1.55, height: 0.6, layer: 'top'
    })
  }
  const bodyH = perSide * pitch + 0.6
  return {
    id,
    name,
    description,
    category: 'Entegre (IC)',
    pads,
    silk: [
      ...rectSilk(-1.95, -bodyH / 2, 3.9, bodyH, 0.15),
      { kind: 'circle', cx: -1.2, cy: -bodyH / 2 + 0.8, r: 0.3, width: 0.15 }
    ],
    body: { x: -rowSpan / 2 - 0.8, y: -bodyH / 2, width: rowSpan + 1.6, height: bodyH }
  }
}

/** Çift sıralı SMD kılıf (SOP/TSSOP/SSOP/MSOP) üreteci — gullwing pad'ler */
function dualSmd(
  id: string,
  name: string,
  description: string,
  category: string,
  pinCount: number,
  pitch: number,
  rowSpan: number,
  padW: number,
  padH: number,
  bodyW: number,
  bodyH: number,
  label?: string
): Footprint {
  const perSide = pinCount / 2
  const startY = -((perSide - 1) * pitch) / 2
  const pads: PadDef[] = []
  for (let i = 0; i < perSide; i++) {
    pads.push({ name: `${i + 1}`, x: -rowSpan / 2, y: startY + i * pitch, shape: 'rect', width: padW, height: padH, layer: 'top' })
  }
  for (let i = 0; i < perSide; i++) {
    pads.push({ name: `${pinCount - i}`, x: rowSpan / 2, y: startY + i * pitch, shape: 'rect', width: padW, height: padH, layer: 'top' })
  }
  const silk: SilkElement[] = [
    ...rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 0.15),
    { kind: 'circle', cx: -bodyW / 2 + 0.5, cy: -bodyH / 2 + 0.5, r: 0.3, width: 0.15 }
  ]
  if (label) silk.push({ kind: 'text', x: 0, y: 0, text: label, size: 0.9 })
  return {
    id,
    name,
    description,
    category,
    pads,
    silk,
    body: { x: -rowSpan / 2 - padW / 2, y: -bodyH / 2, width: rowSpan + padW, height: bodyH }
  }
}

/**
 * QFP/LQFP/TQFP üreteci — 4 kenar gullwing pad, pin1 sol-üstte, saat yönü
 * tersi (CCW: sol↓ · alt→ · sağ↑ · üst←). padLong = radyal uzunluk,
 * padShort = pitch yönü. rowSpan = karşı pad merkez sıraları arası mesafe.
 */
function quadFlat(
  id: string,
  name: string,
  description: string,
  pinsPerSide: number,
  pitch: number,
  bodySize: number,
  padLong: number,
  padShort: number,
  rowSpan: number,
  noLead = false,
  epSize = 0
): Footprint {
  const half = rowSpan / 2
  const startOff = -((pinsPerSide - 1) * pitch) / 2
  const pads: PadDef[] = []
  let pin = 1
  // Sol kenar (y artan)
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({ name: `${pin++}`, x: -half, y: startOff + i * pitch, shape: 'rect', width: padLong, height: padShort, layer: 'top' })
  }
  // Alt kenar (x artan)
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({ name: `${pin++}`, x: startOff + i * pitch, y: half, shape: 'rect', width: padShort, height: padLong, layer: 'top' })
  }
  // Sağ kenar (y azalan)
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({ name: `${pin++}`, x: half, y: startOff + (pinsPerSide - 1 - i) * pitch, shape: 'rect', width: padLong, height: padShort, layer: 'top' })
  }
  // Üst kenar (x azalan)
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({ name: `${pin++}`, x: startOff + (pinsPerSide - 1 - i) * pitch, y: -half, shape: 'rect', width: padShort, height: padLong, layer: 'top' })
  }
  if (epSize > 0) {
    pads.push({ name: 'EP', x: 0, y: 0, shape: 'rect', width: epSize, height: epSize, layer: 'top' })
  }
  const b = bodySize / 2
  const silk: SilkElement[] = noLead
    ? [
        ...rectSilk(-b, -b, bodySize, bodySize, 0.15),
        { kind: 'circle', cx: -b - 0.4, cy: -b - 0.4, r: 0.35, width: 0.2 }
      ]
    : [
        ...rectSilk(-b, -b, bodySize, bodySize, 0.15),
        { kind: 'circle', cx: -b + 0.9, cy: -b + 0.9, r: 0.4, width: 0.15 }
      ]
  const ext = half + padLong / 2
  return {
    id,
    name,
    description,
    category: 'Entegre (IC)',
    pads,
    silk,
    body: { x: -ext, y: -ext, width: ext * 2, height: ext * 2 }
  }
}

/** SMD kutuplu (polarize) 2 pad — elektrolitik/tantalum. Pin1 = '+' */
function smdPolar(
  id: string,
  name: string,
  description: string,
  category: string,
  padCenter: number,
  padW: number,
  padH: number,
  bodyW: number,
  bodyH: number,
  round = false
): Footprint {
  const silk: SilkElement[] = round
    ? [
        { kind: 'circle', cx: 0, cy: 0, r: bodyW / 2, width: 0.15 },
        { kind: 'line', x1: -bodyW / 2, y1: -bodyH * 0.28, x2: -bodyW / 2, y2: bodyH * 0.28, width: 0.4 },
        { kind: 'text', x: -padCenter - padW * 0.2, y: -bodyH / 2 - 0.6, text: '+', size: 1 }
      ]
    : [
        ...rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 0.15),
        { kind: 'line', x1: bodyW / 2 - 0.6, y1: -bodyH / 2, x2: bodyW / 2 - 0.6, y2: bodyH / 2, width: 0.4 },
        { kind: 'text', x: padCenter, y: -bodyH / 2 - 0.6, text: '+', size: 1 }
      ]
  return {
    id,
    name,
    description,
    category,
    pads: [
      { name: '+', x: -padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' },
      { name: '-', x: padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' }
    ],
    silk,
    body: { x: -bodyW / 2, y: -Math.max(padH, bodyH) / 2, width: bodyW, height: Math.max(padH, bodyH) }
  }
}

/** SMD polarize diyot (SOD/SMA/SMB/SMC) — pin1 = katot (bant tarafı) */
function smdDiode(
  id: string,
  name: string,
  description: string,
  padCenter: number,
  padW: number,
  padH: number,
  bodyW: number,
  bodyH: number
): Footprint {
  return {
    id,
    name,
    description,
    category: 'Diyot & LED',
    pads: [
      { name: 'K', x: -padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' },
      { name: 'A', x: padCenter, y: 0, shape: 'rect', width: padW, height: padH, layer: 'top' }
    ],
    silk: [
      ...rectSilk(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 0.15),
      { kind: 'line', x1: -bodyW / 2 + 0.5, y1: -bodyH / 2, x2: -bodyW / 2 + 0.5, y2: bodyH / 2, width: 0.4 }
    ],
    body: { x: -padCenter - padW / 2, y: -Math.max(padH, bodyH) / 2, width: 2 * padCenter + padW, height: Math.max(padH, bodyH) }
  }
}

// ─── Kütüphane ────────────────────────────────────────────────────────────

export const builtinFootprints: Footprint[] = [
  // ═══ Mikrodenetleyici Kartları ═══
  twoRowModule(
    'arduino-nano', 'Arduino Nano', 'Arduino Nano V3 — 43.18×17.78 mm, 2×15 pin, 2.54 mm pitch',
    'Mikrodenetleyici', 17.78, 43.18, 15.24,
    ['TX1', 'RX0', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'],
    ['VIN', 'GND', 'RST2', '5V', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'AREF', '3V3', 'D13'],
    { label: 'NANO' }
  ),
  twoRowModule(
    'arduino-promini', 'Arduino Pro Mini', 'Pro Mini — 33×18 mm, 2×12 pin',
    'Mikrodenetleyici', 18, 33.02, 15.24,
    ['TX0', 'RX1', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'],
    ['RAW', 'GND', 'RST2', 'VCC', 'A3', 'A2', 'A1', 'A0', 'D13', 'D12', 'D11', 'D10'],
    { label: 'PRO MINI' }
  ),
  twoRowModule(
    'esp32-devkit', 'ESP32 DevKit V1 (30 pin)', 'DOIT ESP32 DevKit V1 — 48.3×25.4 mm, 2×15 pin',
    'Mikrodenetleyici', 25.4, 48.26, 22.86,
    ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'],
    ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND2', '3V3'],
    { label: 'ESP32' }
  ),
  twoRowModule(
    'esp8266-nodemcu', 'NodeMCU ESP8266 V3', 'NodeMCU V3 — 48.5×25.6 mm, 2×15 pin',
    'Mikrodenetleyici', 25.6, 48.55, 22.86,
    ['A0', 'RSV1', 'RSV2', 'SD3', 'SD2', 'SD1', 'CMD', 'SD0', 'CLK', 'GND', '3V3', 'EN', 'RST', 'GND2', 'VIN'],
    ['D0', 'D1', 'D2', 'D3', 'D4', '3V3B', 'GND3', 'D5', 'D6', 'D7', 'D8', 'RX', 'TX', 'GND4', '3V3C'],
    { label: 'NODEMCU' }
  ),
  twoRowModule(
    'raspberry-pico', 'Raspberry Pi Pico', 'Pico — 51×21 mm, 2×20 pin, 2.54 mm pitch',
    'Mikrodenetleyici', 21, 51, 17.78,
    ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND4', 'GP14', 'GP15'],
    ['VBUS', 'VSYS', 'GND5', '3V3EN', '3V3', 'VREF', 'GP28', 'GND6', 'GP27', 'GP26', 'RUN', 'GP22', 'GND7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND8', 'GP17', 'GP16'],
    { label: 'PICO' }
  ),
  // Arduino Uno: kenar header'ları ve gerçek montaj delikleri
  {
    id: 'arduino-uno',
    name: 'Arduino Uno R3',
    description: 'Arduino Uno R3 — 68.58×53.34 mm, kenar header + montaj delikleri (shield yerleşimi)',
    category: 'Mikrodenetleyici',
    pads: [
      // Üst kenar: 10 pin (AREF..D8) + 8 pin (D7..D0), ünlü 0.16" ofset ile
      ...['AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'].map((n, i) =>
        thtPad(n, -21.59 + i * P, -24.13, 1.7, 1.0, n === 'AREF')
      ),
      ...['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'].map((n, i) =>
        thtPad(n, 0.51 + i * P, -24.13, 1.7, 1.0)
      ),
      // Alt kenar: güç 8 pin + analog 6 pin
      ...['IOREF', 'RST', '3V3', '5V', 'GND1', 'GND2', 'VIN'].map((n, i) =>
        thtPad(n, -19.05 + i * P, 24.13, 1.7, 1.0)
      ),
      ...['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].map((n, i) =>
        thtPad(n, 3.81 + i * P, 24.13, 1.7, 1.0)
      ),
      // Montaj delikleri (resmi konumlar)
      { name: 'MH1', x: -20.32, y: -24.13 + 2.54, shape: 'circle', width: 4.8, height: 4.8, drill: 3.2, layer: 'both' },
      { name: 'MH2', x: -19.05, y: 24.13 - 1.27, shape: 'circle', width: 4.8, height: 4.8, drill: 3.2, layer: 'both' },
      { name: 'MH3', x: 31.75, y: -8.89, shape: 'circle', width: 4.8, height: 4.8, drill: 3.2, layer: 'both' },
      { name: 'MH4', x: 31.75, y: 19.05, shape: 'circle', width: 4.8, height: 4.8, drill: 3.2, layer: 'both' }
    ],
    silk: [
      ...rectSilk(-34.29, -26.67, 68.58, 53.34),
      { kind: 'text', x: 0, y: 0, text: 'ARDUINO UNO', size: 2 }
    ],
    body: { x: -34.29, y: -26.67, width: 68.58, height: 53.34 }
  },
  dip('atmega328p-dip', 'ATmega328P (DIP-28)', 'ATmega328P-PU — DIP-28 dar kılıf, 7.62 mm sıra aralığı', 28, 7.62),
  dip('attiny85-dip', 'ATtiny85 (DIP-8)', 'ATtiny85-20PU — DIP-8', 8),
  {
    id: 'esp32-wroom',
    name: 'ESP32-WROOM-32 (SMD)',
    description: 'ESP32-WROOM-32 modülü — 18×25.5 mm, kenar lehim pad\'leri (1.27 mm pitch)',
    category: 'Mikrodenetleyici',
    pads: (() => {
      const pads: PadDef[] = []
      const left = ['GND', '3V3', 'EN', 'SVP', 'SVN', 'IO34', 'IO35', 'IO32', 'IO33', 'IO25', 'IO26', 'IO27', 'IO14', 'IO12']
      const right = ['GND2', 'IO23', 'IO22', 'TXD0', 'RXD0', 'IO21', 'NC', 'IO19', 'IO18', 'IO5', 'IO17', 'IO16', 'IO4', 'IO0']
      const startY = -((left.length - 1) * 1.27) / 2 + 3 // pad'ler anten bölgesinin altında
      left.forEach((n, i) => {
        pads.push({
          name: n, x: -8.55, y: startY + i * 1.27,
          shape: 'rect', width: 2.0, height: 0.9, layer: 'top'
        })
      })
      right.forEach((n, i) => {
        pads.push({
          name: n, x: 8.55, y: startY + i * 1.27,
          shape: 'rect', width: 2.0, height: 0.9, layer: 'top'
        })
      })
      // Alt kenar pad'leri (IO2, IO15, SD pinleri)
      const bottom = ['IO2', 'IO15', 'SD1', 'SD0', 'CLK', 'CMD', 'SD3', 'SD2']
      const startX = -((bottom.length - 1) * 1.27) / 2
      bottom.forEach((n, i) => {
        pads.push({
          name: n, x: startX + i * 1.27, y: 12.3,
          shape: 'rect', width: 0.9, height: 2.0, layer: 'top'
        })
      })
      return pads
    })(),
    silk: [
      ...rectSilk(-9, -12.75, 18, 25.5, 0.15),
      { kind: 'line', x1: -9, y1: -6.5, x2: 9, y2: -6.5, width: 0.15 }, // anten sınırı
      { kind: 'text', x: 0, y: 0, text: 'ESP32-WROOM', size: 1 }
    ],
    body: { x: -9.8, y: -12.75, width: 19.6, height: 25.5 }
  },
  // ESP32-C3 Super Mini — pinout mischianti.org referans görseliyle doğrulanmıştır
  twoRowModule(
    'esp32-c3-supermini', 'ESP32-C3 Super Mini', 'ESP32-C3 Super Mini — 22.5×18 mm, 2×8 pin, USB-C',
    'Mikrodenetleyici', 18, 22.5, 15.24,
    ['IO5', 'IO6', 'IO7', 'IO8', 'IO9', 'IO10', 'IO20', 'IO21'],
    ['5V', 'GND', '3V3', 'IO4', 'IO3', 'IO2', 'IO1', 'IO0'],
    { label: 'C3 MINI' }
  ),
  // ESP32-C6 Super Mini (MakerGO) — pinout mischianti.org referans görseliyle
  // doğrulanmıştır: 2×10 kenar pini + alt kenarda 5 ek pin (GPIO21/22/23,
  // USB D+/D-) + ortada B+/B- LiPo pil pedleri.
  (() => {
    const fp = twoRowModule(
      'esp32-c6-supermini', 'ESP32-C6 Super Mini',
      'ESP32-C6 Super Mini (MakerGO) — 20×32 mm, 2×10 kenar pini + alt kenarda 5 pin + BAT pedleri, USB-C',
      'Mikrodenetleyici', 20, 32, 16,
      ['IO16', 'IO17', 'IO0', 'IO1', 'IO2', 'IO3', 'IO4', 'IO5', 'IO6', 'IO7'],
      ['5V', 'GND', '3V3', 'IO20', 'IO19', 'IO18', 'IO15', 'IO14', 'IO9', 'IO8'],
      { label: 'C6 MINI' }
    )
    // Alt kenar: GPIO21/22/23 ve USB D+/D- (kartta ayrı bir sırada)
    const bottomRow: { name: string; x: number }[] = [
      { name: 'IO23', x: -6 },
      { name: 'IO22', x: -3 },
      { name: 'IO21', x: 0 },
      { name: 'IO12', x: 3 },
      { name: 'IO13', x: 6 }
    ]
    for (const p of bottomRow) {
      fp.pads.push({ name: p.name, x: p.x, y: 14.5, shape: 'circle', width: 1.7, height: 1.7, drill: 1.0, layer: 'both' })
    }
    // Ortadaki LiPo pil pedleri (B+ / B-)
    fp.pads.push(
      { name: 'BAT+', x: -2, y: -13, shape: 'circle', width: 1.4, height: 1.4, drill: 0.8, layer: 'both' },
      { name: 'BAT-', x: 2, y: -13, shape: 'circle', width: 1.4, height: 1.4, drill: 0.8, layer: 'both' }
    )
    return fp
  })(),
  // ESP32-S2 Mini (Wemos/Lolin) — pinout wemos.cc resmi diyagramıyla
  // doğrulanmıştır. D1 Mini uyumlu DIŞ sıra + sonradan eklenen İÇ sıra
  // (4 kolon toplam), üst köşelerde 2 montaj deliği.
  (() => {
    const pads: PadDef[] = []
    const rows = 8
    const startY = -((rows - 1) * P) / 2
    const outerLeft = ['EN', 'IO3', 'IO5', 'IO7', 'IO9', 'IO11', 'IO12', '3V3']
    const innerLeft = ['IO1', 'IO2', 'IO4', 'IO6', 'IO8', 'IO10', 'IO13', 'IO14']
    const innerRight = ['IO40', 'IO38', 'IO36', 'IO34', 'IO21', 'IO17', 'GND', 'IO15']
    const outerRight = ['IO39', 'IO37', 'IO35', 'IO33', 'IO18', 'IO16', 'GND2', 'VBUS']
    outerLeft.forEach((n, i) => pads.push(thtPad(n, -11.43, startY + i * P, 1.7, 1.0, i === 0)))
    innerLeft.forEach((n, i) => pads.push(thtPad(n, -8.89, startY + i * P, 1.7, 1.0)))
    innerRight.forEach((n, i) => pads.push(thtPad(n, 8.89, startY + i * P, 1.7, 1.0)))
    outerRight.forEach((n, i) => pads.push(thtPad(n, 11.43, startY + i * P, 1.7, 1.0)))
    pads.push(
      { name: 'MH1', x: -9.5, y: -14.5, shape: 'circle', width: 3.8, height: 3.8, drill: 2.2, layer: 'both' },
      { name: 'MH2', x: 9.5, y: -14.5, shape: 'circle', width: 3.8, height: 3.8, drill: 2.2, layer: 'both' }
    )
    return {
      id: 'esp32-s2-mini',
      name: 'ESP32-S2 Mini',
      description: 'ESP32-S2 Mini (Wemos/Lolin) — 34.3×25.4 mm, D1 Mini uyumlu dış sıra + iç sıra (4×8 pin), USB-C',
      category: 'Mikrodenetleyici',
      pads,
      silk: [
        ...rectSilk(-12.7, -17.15, 25.4, 34.3),
        { kind: 'text', x: 0, y: 0, text: 'S2 MINI', size: 1.2 }
      ],
      body: { x: -12.7, y: -17.15, width: 25.4, height: 34.3 }
    }
  })(),

  // ═══ Motor Sürücüler ═══
  {
    id: 'l298n-module',
    name: 'L298N Motor Sürücü Modülü',
    description: 'Çift H-köprü L298N kırmızı modül — 43.5×43.2 mm, vida klemensler + kontrol header',
    category: 'Motor Sürücü',
    pads: [
      // Motor A çıkışları (sol kenar)
      thtPad('OUT1', -19, -7.5, 2.4, 1.3, true),
      thtPad('OUT2', -19, -2.5, 2.4, 1.3),
      // Motor B çıkışları (sağ kenar)
      thtPad('OUT3', 19, -7.5, 2.4, 1.3),
      thtPad('OUT4', 19, -2.5, 2.4, 1.3),
      // Güç girişi (sol alt)
      thtPad('12V', -19, 8, 2.4, 1.3),
      thtPad('GND', -19, 13, 2.4, 1.3),
      thtPad('5V', -19, 18, 2.4, 1.3),
      // Kontrol header (alt kenar)
      ...['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].map((n, i) =>
        thtPad(n, -6.35 + i * P, 19, 1.7, 1.0)
      ),
      // Montaj delikleri
      { name: 'MH1', x: -18.5, y: -18.5, shape: 'circle', width: 4.6, height: 4.6, drill: 3.2, layer: 'both' },
      { name: 'MH2', x: 18.5, y: -18.5, shape: 'circle', width: 4.6, height: 4.6, drill: 3.2, layer: 'both' },
      { name: 'MH3', x: -18.5, y: 18.5, shape: 'circle', width: 4.6, height: 4.6, drill: 3.2, layer: 'both' },
      { name: 'MH4', x: 18.5, y: 18.5, shape: 'circle', width: 4.6, height: 4.6, drill: 3.2, layer: 'both' }
    ],
    silk: [
      ...rectSilk(-21.75, -21.6, 43.5, 43.2),
      { kind: 'text', x: 0, y: -10, text: 'L298N', size: 2 }
    ],
    body: { x: -21.75, y: -21.6, width: 43.5, height: 43.2 }
  },
  twoRowModule(
    'a4988-module', 'A4988 Step Motor Sürücü', 'A4988 StepStick — 20.3×15.2 mm, 2×8 pin',
    'Motor Sürücü', 15.24, 20.32, 12.7,
    ['EN', 'MS1', 'MS2', 'MS3', 'RST', 'SLP', 'STEP', 'DIR'],
    ['VMOT', 'GND', '2B', '2A', '1A', '1B', 'VDD', 'GND2'],
    { label: 'A4988' }
  ),
  twoRowModule(
    'drv8825-module', 'DRV8825 Step Motor Sürücü', 'DRV8825 StepStick — 20.3×15.2 mm, 2×8 pin',
    'Motor Sürücü', 15.24, 20.32, 12.7,
    ['EN', 'M0', 'M1', 'M2', 'RST', 'SLP', 'STEP', 'DIR'],
    ['VMOT', 'GND', 'B2', 'B1', 'A1', 'A2', 'FLT', 'GND2'],
    { label: 'DRV8825' }
  ),
  twoRowModule(
    'tb6612fng-module', 'TB6612FNG Motor Sürücü', 'TB6612FNG breakout — 20.3×20.3 mm, 2×8 pin',
    'Motor Sürücü', 20.32, 20.32, 15.24,
    ['VM', 'VCC', 'GND', 'A01', 'A02', 'B02', 'B01', 'GND2'],
    ['PWMA', 'AIN2', 'AIN1', 'STBY', 'BIN1', 'BIN2', 'PWMB', 'GND3'],
    { label: 'TB6612' }
  ),
  dip('l293d-dip', 'L293D (DIP-16)', 'L293D çift H-köprü sürücü — DIP-16', 16),
  dip('uln2003a-dip', 'ULN2003A (DIP-16)', 'ULN2003A Darlington dizisi — DIP-16', 16),

  // ═══ Dirençler ═══
  axial('r-axial-025w', 'Direnç 1/4W (Axial)', 'Karbon film 1/4W — gövde 6.3×2.3 mm, 10.16 mm pitch', 'Direnç', 10.16, 6.3, 2.3),
  axial('r-axial-05w', 'Direnç 1/2W (Axial)', 'Karbon film 1/2W — gövde 9×3.2 mm, 12.7 mm pitch', 'Direnç', 12.7, 9, 3.2),
  smdChip('r-0603', 'Direnç 0603 (SMD)', 'SMD direnç 0603 — 1.6×0.8 mm', 'Direnç', 0.8, 0.8, 1.0, 1.6, 0.8),
  smdChip('r-0805', 'Direnç 0805 (SMD)', 'SMD direnç 0805 — 2.0×1.25 mm', 'Direnç', 1.0, 1.0, 1.3, 2.0, 1.25),
  smdChip('r-1206', 'Direnç 1206 (SMD)', 'SMD direnç 1206 — 3.2×1.6 mm', 'Direnç', 1.45, 1.1, 1.7, 3.2, 1.6),
  {
    id: 'trimpot-3296',
    name: 'Trimpot 3296W',
    description: 'Bourns 3296W çok turlu trimpot — 9.5×4.8 mm, 3 pin',
    category: 'Direnç',
    pads: [
      thtPad('1', -2.54, 0, 1.6, 0.8, true),
      thtPad('2', 0, 0, 1.6, 0.8),
      thtPad('3', 2.54, 0, 1.6, 0.8)
    ],
    silk: rectSilk(-4.75, -2.4, 9.5, 4.8),
    body: { x: -4.75, y: -2.4, width: 9.5, height: 4.8 }
  },
  {
    id: 'pot-rv09',
    name: 'Potansiyometre RV09',
    description: 'RV09 dikey potansiyometre — 9.5×11 mm, 3 pin 2.54 pitch',
    category: 'Direnç',
    pads: [
      thtPad('1', -2.54, 3.5, 1.6, 0.9, true),
      thtPad('2', 0, 3.5, 1.6, 0.9),
      thtPad('3', 2.54, 3.5, 1.6, 0.9)
    ],
    silk: [
      ...rectSilk(-4.75, -5.5, 9.5, 11),
      { kind: 'circle', cx: 0, cy: -0.5, r: 3, width: 0.2 }
    ],
    body: { x: -4.75, y: -5.5, width: 9.5, height: 11 }
  },

  // ═══ Kondansatörler ═══
  {
    id: 'c-disc-2.54',
    name: 'Seramik Kondansatör (2.54)',
    description: 'Seramik disk/MLCC — 2.54 mm pitch',
    category: 'Kondansatör',
    pads: [thtPad('1', -1.27, 0, 1.5, 0.8), thtPad('2', 1.27, 0, 1.5, 0.8)],
    silk: rectSilk(-2.1, -1.25, 4.2, 2.5),
    body: { x: -2.1, y: -1.25, width: 4.2, height: 2.5 }
  },
  {
    id: 'c-disc-5.08',
    name: 'Seramik Kondansatör (5.08)',
    description: 'Seramik disk — 5.08 mm pitch',
    category: 'Kondansatör',
    pads: [thtPad('1', -2.54, 0, 1.6, 0.8), thtPad('2', 2.54, 0, 1.6, 0.8)],
    silk: rectSilk(-3.5, -1.75, 7, 3.5),
    body: { x: -3.5, y: -1.75, width: 7, height: 3.5 }
  },
  radialCap('c-elec-5', 'Elektrolitik 5 mm', 'Radyal elektrolitik — Ø5 mm, 2.0 mm pitch (ör. 10-47 µF)', 5, 2.0),
  radialCap('c-elec-6.3', 'Elektrolitik 6.3 mm', 'Radyal elektrolitik — Ø6.3 mm, 2.5 mm pitch (ör. 100 µF)', 6.3, 2.5),
  radialCap('c-elec-8', 'Elektrolitik 8 mm', 'Radyal elektrolitik — Ø8 mm, 3.5 mm pitch (ör. 220-470 µF)', 8, 3.5),
  radialCap('c-elec-10', 'Elektrolitik 10 mm', 'Radyal elektrolitik — Ø10 mm, 5.0 mm pitch (ör. 1000 µF)', 10, 5.0),
  smdChip('c-0603', 'Kondansatör 0603 (SMD)', 'MLCC 0603', 'Kondansatör', 0.8, 0.8, 1.0, 1.6, 0.8),
  smdChip('c-0805', 'Kondansatör 0805 (SMD)', 'MLCC 0805', 'Kondansatör', 1.0, 1.0, 1.3, 2.0, 1.25),
  smdChip('c-1206', 'Kondansatör 1206 (SMD)', 'MLCC 1206', 'Kondansatör', 1.45, 1.1, 1.7, 3.2, 1.6),

  // ═══ Diyot & LED ═══
  axial('d-do41', '1N4007 (DO-41)', 'Genel amaçlı diyot — DO-41, 10.16 mm pitch. Bant = katot', 'Diyot & LED', 10.16, 5.2, 2.7, true),
  axial('d-do35', '1N4148 (DO-35)', 'Sinyal diyodu — DO-35, 7.62 mm pitch. Bant = katot', 'Diyot & LED', 7.62, 3.8, 1.8, true),
  {
    id: 'led-3mm',
    name: 'LED 3 mm',
    description: 'THT LED Ø3 mm — 2.54 pitch. Düz kenar = katot',
    category: 'Diyot & LED',
    pads: [thtPad('A', -1.27, 0, 1.6, 0.8, true), thtPad('K', 1.27, 0, 1.6, 0.8)],
    silk: [
      { kind: 'circle', cx: 0, cy: 0, r: 1.5, width: 0.2 },
      { kind: 'line', x1: 2.1, y1: -1.2, x2: 2.1, y2: 1.2, width: 0.3 }
    ],
    body: { x: -1.9, y: -1.9, width: 3.8, height: 3.8 }
  },
  {
    id: 'led-5mm',
    name: 'LED 5 mm',
    description: 'THT LED Ø5 mm — 2.54 pitch. Düz kenar = katot',
    category: 'Diyot & LED',
    pads: [thtPad('A', -1.27, 0, 1.7, 0.9, true), thtPad('K', 1.27, 0, 1.7, 0.9)],
    silk: [
      { kind: 'circle', cx: 0, cy: 0, r: 2.5, width: 0.2 },
      { kind: 'line', x1: 3.1, y1: -1.8, x2: 3.1, y2: 1.8, width: 0.3 }
    ],
    body: { x: -2.9, y: -2.9, width: 5.8, height: 5.8 }
  },
  smdChip('led-0805', 'LED 0805 (SMD)', 'SMD LED 0805', 'Diyot & LED', 1.0, 1.0, 1.3, 2.0, 1.25),

  // ═══ Transistör & Regülatör ═══
  {
    id: 'to92',
    name: 'TO-92 (BC547, 2N2222, LM35...)',
    description: 'TO-92 kılıf — kademeli 3 pad, düz yüz öne bakar (1-2-3 soldan sağa)',
    category: 'Transistör & Regülatör',
    pads: [
      thtPad('1', -1.27, 0.635, 1.5, 0.8, true),
      thtPad('2', 0, -0.635, 1.5, 0.8),
      thtPad('3', 1.27, 0.635, 1.5, 0.8)
    ],
    silk: [
      { kind: 'circle', cx: 0, cy: 0, r: 2.3, width: 0.2 },
      { kind: 'line', x1: -2.1, y1: 1.4, x2: 2.1, y2: 1.4, width: 0.25 }
    ],
    body: { x: -2.3, y: -2.3, width: 4.6, height: 4.6 }
  },
  {
    id: 'to220',
    name: 'TO-220 (7805, LM317, MOSFET...)',
    description: 'TO-220 dikey — 3 pin, 2.54 pitch, soğutucu deliği yok',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -2.54, y: 0, shape: 'oval', width: 1.8, height: 2.2, drill: 1.0, layer: 'both' },
      { name: '2', x: 0, y: 0, shape: 'oval', width: 1.8, height: 2.2, drill: 1.0, layer: 'both' },
      { name: '3', x: 2.54, y: 0, shape: 'oval', width: 1.8, height: 2.2, drill: 1.0, layer: 'both' }
    ],
    silk: [
      ...rectSilk(-5.1, -3.4, 10.2, 2.6),
      { kind: 'line', x1: -5.1, y1: -3.4, x2: 5.1, y2: -3.4, width: 0.4 }
    ],
    body: { x: -5.1, y: -3.4, width: 10.2, height: 5.6 }
  },
  {
    id: 'sot23',
    name: 'SOT-23',
    description: 'SOT-23 SMD transistör kılıfı',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -0.95, y: 1.1, shape: 'rect', width: 0.9, height: 1.0, layer: 'top' },
      { name: '2', x: 0.95, y: 1.1, shape: 'rect', width: 0.9, height: 1.0, layer: 'top' },
      { name: '3', x: 0, y: -1.1, shape: 'rect', width: 0.9, height: 1.0, layer: 'top' }
    ],
    silk: rectSilk(-1.5, -0.7, 3.0, 1.4, 0.15),
    body: { x: -1.5, y: -1.7, width: 3.0, height: 3.4 }
  },
  {
    id: 'lm2596-module',
    name: 'LM2596 Buck Modülü',
    description: 'LM2596 ayarlı düşürücü regülatör modülü — 43×21 mm, 4 pad',
    category: 'Transistör & Regülatör',
    pads: [
      thtPad('IN+', -18.5, -8, 2.2, 1.2, true),
      thtPad('IN-', -18.5, 8, 2.2, 1.2),
      thtPad('OUT+', 18.5, -8, 2.2, 1.2),
      thtPad('OUT-', 18.5, 8, 2.2, 1.2)
    ],
    silk: [
      ...rectSilk(-21.5, -10.5, 43, 21),
      { kind: 'text', x: 0, y: 0, text: 'LM2596', size: 1.5 }
    ],
    body: { x: -21.5, y: -10.5, width: 43, height: 21 }
  },

  // ═══ Entegreler ═══
  dip('dip8', 'DIP-8 (NE555, LM358...)', 'Genel DIP-8 kılıf', 8),
  dip('dip14', 'DIP-14 (74HC00...)', 'Genel DIP-14 kılıf', 14),
  dip('dip16', 'DIP-16 (74HC595, CD4017...)', 'Genel DIP-16 kılıf', 16),
  dip('dip18', 'DIP-18 (PIC16F84...)', 'Genel DIP-18 kılıf', 18),
  dip('dip20', 'DIP-20', 'Genel DIP-20 kılıf', 20),
  dip('dip40-wide', 'DIP-40 geniş (ATmega32...)', 'DIP-40 geniş kılıf — 15.24 mm sıra aralığı', 40, 15.24),
  soic('soic8', 'SOIC-8', 'SOIC-8 SMD kılıf — 1.27 pitch', 8),
  soic('soic14', 'SOIC-14', 'SOIC-14 SMD kılıf', 14),
  soic('soic16', 'SOIC-16', 'SOIC-16 SMD kılıf', 16),

  // ═══ Konnektörler ═══
  ...[2, 3, 4, 5, 6, 8, 10].map((n) =>
    header(`header-1x${n}`, `Pin Header 1×${n}`, `Erkek pin header 1×${n} — 2.54 mm pitch`, n, 1)
  ),
  header('header-2x3', 'Pin Header 2×3 (ISP)', 'ISP programlama header — 2×3', 3, 2),
  header('header-2x5', 'Pin Header 2×5 (IDC)', 'IDC header — 2×5', 5, 2),
  {
    id: 'screw-terminal-2',
    name: 'Vida Klemens 2P (5.08)',
    description: 'Vida klemens 2 kutup — 5.08 mm pitch',
    category: 'Konnektör',
    pads: [thtPad('1', -2.54, 0, 2.4, 1.3, true), thtPad('2', 2.54, 0, 2.4, 1.3)],
    silk: rectSilk(-5.08, -4.1, 10.16, 8.2),
    body: { x: -5.08, y: -4.1, width: 10.16, height: 8.2 }
  },
  {
    id: 'screw-terminal-3',
    name: 'Vida Klemens 3P (5.08)',
    description: 'Vida klemens 3 kutup — 5.08 mm pitch',
    category: 'Konnektör',
    pads: [
      thtPad('1', -5.08, 0, 2.4, 1.3, true),
      thtPad('2', 0, 0, 2.4, 1.3),
      thtPad('3', 5.08, 0, 2.4, 1.3)
    ],
    silk: rectSilk(-7.62, -4.1, 15.24, 8.2),
    body: { x: -7.62, y: -4.1, width: 15.24, height: 8.2 }
  },
  ...[2, 3, 4].map((n): Footprint => {
    const startX = -((n - 1) * 2.5) / 2
    return {
      id: `jst-xh-${n}`,
      name: `JST-XH ${n} Pin`,
      description: `JST-XH konnektör ${n} pin — 2.5 mm pitch`,
      category: 'Konnektör',
      pads: Array.from({ length: n }, (_, i) =>
        thtPad(`${i + 1}`, startX + i * 2.5, 0, 1.7, 0.9, i === 0)
      ),
      silk: rectSilk(startX - 2.45, -2.9, (n - 1) * 2.5 + 4.9, 5.8),
      body: { x: startX - 2.45, y: -2.9, width: (n - 1) * 2.5 + 4.9, height: 5.8 }
    }
  }),
  {
    id: 'barrel-jack',
    name: 'DC Barrel Jack (DC-005)',
    description: 'DC güç girişi 5.5/2.1 mm — DC-005 THT',
    category: 'Konnektör',
    pads: [
      { name: 'PWR', x: -4.5, y: 0, shape: 'oval', width: 3.5, height: 2.2, drill: 1.6, layer: 'both' },
      { name: 'GND', x: 1.5, y: 0, shape: 'oval', width: 3.5, height: 2.2, drill: 1.6, layer: 'both' },
      { name: 'SW', x: -1.5, y: 4.7, shape: 'oval', width: 3.5, height: 2.2, drill: 1.6, layer: 'both' }
    ],
    silk: rectSilk(-7.25, -4.5, 14.5, 9),
    body: { x: -7.25, y: -4.5, width: 14.5, height: 9 }
  },

  // ═══ Buton & Mekanik ═══
  {
    id: 'tact-6x6',
    name: 'Tact Buton 6×6',
    description: 'Tact switch 6×6 mm — 4 pin (1-2 ve 3-4 dahili bağlı)',
    category: 'Buton & Mekanik',
    pads: [
      thtPad('1', -3.25, -2.25, 1.7, 1.0, true),
      thtPad('2', 3.25, -2.25, 1.7, 1.0),
      thtPad('3', -3.25, 2.25, 1.7, 1.0),
      thtPad('4', 3.25, 2.25, 1.7, 1.0)
    ],
    silk: [
      ...rectSilk(-3, -3, 6, 6),
      { kind: 'circle', cx: 0, cy: 0, r: 1.75, width: 0.2 }
    ],
    body: { x: -4.1, y: -3, width: 8.2, height: 6 }
  },
  {
    id: 'buzzer-12mm',
    name: 'Buzzer 12 mm',
    description: 'Aktif/pasif buzzer Ø12 mm — 7.6 mm pitch. + işareti pin 1',
    category: 'Buton & Mekanik',
    pads: [thtPad('+', -3.8, 0, 1.7, 0.9, true), thtPad('-', 3.8, 0, 1.7, 0.9)],
    silk: [
      { kind: 'circle', cx: 0, cy: 0, r: 6, width: 0.2 },
      { kind: 'text', x: -5.5, y: -6, text: '+', size: 1.2 }
    ],
    body: { x: -6, y: -6, width: 12, height: 12 }
  },
  {
    id: 'crystal-hc49',
    name: 'Kristal HC-49S',
    description: 'HC-49S kristal — 4.88 mm pitch (16 MHz vb.)',
    category: 'Buton & Mekanik',
    pads: [thtPad('1', -2.44, 0, 1.5, 0.8), thtPad('2', 2.44, 0, 1.5, 0.8)],
    silk: [
      ...rectSilk(-5.75, -2.35, 11.5, 4.7),
      { kind: 'circle', cx: -5.75, cy: 0, r: 0.01, width: 0.1 }
    ],
    body: { x: -5.75, y: -2.35, width: 11.5, height: 4.7 }
  },
  {
    id: 'relay-srd05',
    name: 'Röle SRD-05VDC',
    description: 'Songle SRD-05VDC-SL-C — 19.4×15.6 mm (yaklaşık pin yerleşimi)',
    category: 'Buton & Mekanik',
    pads: [
      thtPad('COIL1', -8.2, -3.8, 2.2, 1.2, true),
      thtPad('COIL2', -8.2, 3.8, 2.2, 1.2),
      thtPad('COM', 8.2, 0, 2.2, 1.2),
      thtPad('NO', 4.2, -6.1, 2.2, 1.2),
      thtPad('NC', 4.2, 6.1, 2.2, 1.2)
    ],
    silk: [
      ...rectSilk(-9.7, -7.8, 19.4, 15.6),
      { kind: 'text', x: 0, y: 0, text: 'RÖLE', size: 1.3 }
    ],
    body: { x: -9.7, y: -7.8, width: 19.4, height: 15.6 }
  },

  // ═══ Sensör & Modüller ═══
  {
    id: 'hc-sr04',
    name: 'HC-SR04 Ultrasonik',
    description: 'HC-SR04 mesafe sensörü — 45.5×20.5 mm, 4 pin alt kenar',
    category: 'Sensör & Modül',
    pads: [
      ...['VCC', 'TRIG', 'ECHO', 'GND'].map((n, i) =>
        thtPad(n, -3.81 + i * P, 9, 1.7, 1.0, n === 'VCC')
      )
    ],
    silk: [
      ...rectSilk(-22.75, -10.25, 45.5, 20.5),
      { kind: 'circle', cx: -13, cy: -1, r: 8, width: 0.2 },
      { kind: 'circle', cx: 13, cy: -1, r: 8, width: 0.2 }
    ],
    body: { x: -22.75, y: -10.25, width: 45.5, height: 20.5 }
  },
  {
    id: 'hc-05',
    name: 'HC-05 Bluetooth',
    description: 'HC-05 Bluetooth modülü (breakout) — 37.3×16 mm, 6 pin',
    category: 'Sensör & Modül',
    pads: [
      ...['STATE', 'RXD', 'TXD', 'GND', 'VCC', 'EN'].map((n, i) =>
        thtPad(n, -6.35 + i * P, 16.5, 1.7, 1.0, n === 'STATE')
      )
    ],
    silk: [
      ...rectSilk(-8, -18.65, 16, 37.3),
      { kind: 'text', x: 0, y: 0, text: 'HC-05', size: 1.3 }
    ],
    body: { x: -8, y: -18.65, width: 16, height: 37.3 }
  },
  {
    id: 'nrf24l01',
    name: 'NRF24L01+ Modülü',
    description: 'NRF24L01+ 2.4 GHz — 29×15.5 mm, 2×4 header',
    category: 'Sensör & Modül',
    pads: (() => {
      const names = [
        ['GND', 'CE', 'SCK', 'MISO'],
        ['VCC', 'CSN', 'MOSI', 'IRQ']
      ]
      const pads: PadDef[] = []
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 2; r++) {
          pads.push(
            thtPad(names[r][c], -3.81 + c * P, 6 + r * P, 1.7, 1.0, r === 0 && c === 0)
          )
        }
      }
      return pads
    })(),
    silk: [
      ...rectSilk(-14.5, -7.75 - 2, 29, 15.5),
      { kind: 'text', x: 0, y: -4, text: 'NRF24', size: 1.3 }
    ],
    body: { x: -14.5, y: -9.75, width: 29, height: 19.5 }
  },
  {
    id: 'mpu6050-module',
    name: 'MPU6050 (GY-521)',
    description: 'GY-521 ivme/jiroskop modülü — 21.2×16.4 mm, 8 pin',
    category: 'Sensör & Modül',
    pads: [
      ...['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'].map((n, i) =>
        thtPad(n, -8.89 + i * P, -6, 1.7, 1.0, n === 'VCC')
      )
    ],
    silk: [
      ...rectSilk(-10.6, -8.2, 21.2, 16.4),
      { kind: 'text', x: 0, y: 2, text: 'GY-521', size: 1.3 }
    ],
    body: { x: -10.6, y: -8.2, width: 21.2, height: 16.4 }
  },
  {
    id: 'ds3231-module',
    name: 'DS3231 RTC Modülü',
    description: 'DS3231 gerçek zaman saati (mini) — 22×14 mm, 6 pin',
    category: 'Sensör & Modül',
    pads: [
      ...['32K', 'SQW', 'SCL', 'SDA', 'VCC', 'GND'].map((n, i) =>
        thtPad(n, -6.35 + i * P, -5, 1.7, 1.0, n === '32K')
      )
    ],
    silk: [
      ...rectSilk(-11, -7, 22, 14),
      { kind: 'text', x: 0, y: 2, text: 'DS3231', size: 1.3 }
    ],
    body: { x: -11, y: -7, width: 22, height: 14 }
  },
  {
    id: 'dht22',
    name: 'DHT22 (AM2302)',
    description: 'DHT22 sıcaklık/nem sensörü — 15.1×25.1 mm, 4 pin 2.54 pitch',
    category: 'Sensör & Modül',
    pads: [
      ...['VCC', 'DATA', 'NC', 'GND'].map((n, i) =>
        thtPad(n, -3.81 + i * P, 10, 1.7, 1.0, n === 'VCC')
      )
    ],
    silk: [
      ...rectSilk(-7.55, -12.55, 15.1, 25.1),
      { kind: 'text', x: 0, y: -2, text: 'DHT22', size: 1.3 }
    ],
    body: { x: -7.55, y: -12.55, width: 15.1, height: 25.1 }
  },
  {
    id: 'oled-096',
    name: 'OLED 0.96" (SSD1306)',
    description: 'SSD1306 OLED ekran modülü — 27.3×27.8 mm, 4 pin I2C',
    category: 'Sensör & Modül',
    pads: [
      ...['GND', 'VCC', 'SCL', 'SDA'].map((n, i) =>
        thtPad(n, -3.81 + i * P, -12, 1.7, 1.0, n === 'GND')
      ),
      { name: 'MH1', x: -11.4, y: -11.6, shape: 'circle', width: 3.5, height: 3.5, drill: 2, layer: 'both' },
      { name: 'MH2', x: 11.4, y: -11.6, shape: 'circle', width: 3.5, height: 3.5, drill: 2, layer: 'both' },
      { name: 'MH3', x: -11.4, y: 11.6, shape: 'circle', width: 3.5, height: 3.5, drill: 2, layer: 'both' },
      { name: 'MH4', x: 11.4, y: 11.6, shape: 'circle', width: 3.5, height: 3.5, drill: 2, layer: 'both' }
    ],
    silk: [
      ...rectSilk(-13.65, -13.9, 27.3, 27.8),
      ...rectSilk(-13, -5, 26, 13)
    ],
    body: { x: -13.65, y: -13.9, width: 27.3, height: 27.8 }
  },

  // ═══════════════════ SMD (Yüzey Montaj) ═══════════════════
  // ── SMD Direnç (ek boyutlar) ──
  smdChip('r-0201', 'Direnç 0201 (SMD)', 'SMD direnç 0201 — 0.6×0.3 mm', 'Direnç', 0.33, 0.4, 0.45, 0.6, 0.3),
  smdChip('r-0402', 'Direnç 0402 (SMD)', 'SMD direnç 0402 — 1.0×0.5 mm', 'Direnç', 0.51, 0.6, 0.6, 1.0, 0.5),
  smdChip('r-1210', 'Direnç 1210 (SMD)', 'SMD direnç 1210 — 3.2×2.5 mm', 'Direnç', 1.5, 1.2, 2.7, 3.2, 2.5),
  smdChip('r-2512', 'Direnç 2512 (SMD)', 'SMD güç direnci 2512 — 6.3×3.2 mm (1-2 W)', 'Direnç', 2.95, 1.6, 3.4, 6.3, 3.2),

  // ── SMD Kondansatör (ek boyutlar) ──
  smdChip('c-0402', 'Kondansatör 0402 (SMD)', 'MLCC 0402 — 1.0×0.5 mm', 'Kondansatör', 0.51, 0.6, 0.6, 1.0, 0.5),
  smdChip('c-1210', 'Kondansatör 1210 (SMD)', 'MLCC 1210 — 3.2×2.5 mm', 'Kondansatör', 1.5, 1.2, 2.7, 3.2, 2.5),
  // SMD Elektrolitik (V-chip alüminyum, kutuplu)
  smdPolar('c-smd-elec-4', 'SMD Elektrolitik Ø4', 'V-chip alüminyum elektrolitik — Ø4×5.4 mm', 'Kondansatör', 1.6, 1.1, 2.0, 4.3, 4.3, true),
  smdPolar('c-smd-elec-6.3', 'SMD Elektrolitik Ø6.3', 'V-chip alüminyum elektrolitik — Ø6.3×5.4 mm', 'Kondansatör', 2.4, 1.4, 2.6, 6.6, 6.6, true),
  smdPolar('c-smd-elec-8', 'SMD Elektrolitik Ø8', 'V-chip alüminyum elektrolitik — Ø8×10 mm', 'Kondansatör', 3.1, 1.6, 3.2, 8.4, 8.4, true),
  // SMD Tantalum (EIA kılıfları)
  smdPolar('c-tant-a', 'Tantalum A (3216)', 'SMD tantalum kondansatör — kılıf A / 3216', 'Kondansatör', 1.5, 1.2, 1.8, 3.2, 1.6),
  smdPolar('c-tant-b', 'Tantalum B (3528)', 'SMD tantalum kondansatör — kılıf B / 3528', 'Kondansatör', 1.65, 1.4, 2.2, 3.5, 2.8),
  smdPolar('c-tant-c', 'Tantalum C (6032)', 'SMD tantalum kondansatör — kılıf C / 6032', 'Kondansatör', 2.7, 1.6, 2.6, 6.0, 3.2),
  smdPolar('c-tant-d', 'Tantalum D (7343)', 'SMD tantalum kondansatör — kılıf D / 7343', 'Kondansatör', 3.2, 1.6, 2.8, 7.3, 4.3),

  // ── SMD Diyot & LED ──
  smdDiode('d-sod123', 'Diyot SOD-123', 'SMD diyot SOD-123 (ör. 1N4148W). Bant = katot', 1.9, 1.0, 1.2, 2.7, 1.6),
  smdDiode('d-sod323', 'Diyot SOD-323', 'SMD diyot SOD-323. Bant = katot', 1.35, 0.7, 0.9, 1.7, 1.25),
  smdDiode('d-sma', 'Diyot SMA (DO-214AC)', 'SMD güç diyodu SMA (ör. 1N4007 SMD). Bant = katot', 2.3, 1.5, 1.6, 4.3, 2.6),
  smdDiode('d-smb', 'Diyot SMB (DO-214AA)', 'SMD güç diyodu SMB. Bant = katot', 2.4, 1.6, 2.2, 4.3, 3.6),
  smdDiode('d-smc', 'Diyot SMC (DO-214AB)', 'SMD güç diyodu SMC. Bant = katot', 3.3, 1.8, 3.2, 6.9, 4.6),
  smdChip('led-0603', 'LED 0603 (SMD)', 'SMD LED 0603 — 1.6×0.8 mm', 'Diyot & LED', 0.8, 0.8, 1.0, 1.6, 0.8),
  smdChip('led-1206', 'LED 1206 (SMD)', 'SMD LED 1206 — 3.2×1.6 mm', 'Diyot & LED', 1.45, 1.1, 1.7, 3.2, 1.6),
  smdChip('led-3528', 'LED 3528 (PLCC-2)', 'SMD LED 3528 — 3.5×2.8 mm', 'Diyot & LED', 1.6, 1.3, 3.0, 3.5, 2.8),

  // ── SOT transistör/regülatör kılıfları ──
  {
    id: 'sot23-5',
    name: 'SOT-23-5',
    description: 'SOT-23-5 SMD kılıf — 0.95 mm pitch (ör. regülatör, op-amp)',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -0.95, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '2', x: 0, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '3', x: 0.95, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '4', x: 0.95, y: -1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '5', x: -0.95, y: -1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' }
    ],
    silk: [...rectSilk(-0.8, -0.7, 1.6, 1.4, 0.12), { kind: 'circle', cx: -1.3, cy: 1.5, r: 0.25, width: 0.12 }],
    body: { x: -1.5, y: -1.7, width: 3.0, height: 3.4 }
  },
  {
    id: 'sot23-6',
    name: 'SOT-23-6',
    description: 'SOT-23-6 / TSOT-6 SMD kılıf — 0.95 mm pitch',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -0.95, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '2', x: 0, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '3', x: 0.95, y: 1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '4', x: 0.95, y: -1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '5', x: 0, y: -1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' },
      { name: '6', x: -0.95, y: -1.0, shape: 'rect', width: 0.6, height: 1.0, layer: 'top' }
    ],
    silk: [...rectSilk(-0.8, -0.7, 1.6, 1.4, 0.12), { kind: 'circle', cx: -1.3, cy: 1.5, r: 0.25, width: 0.12 }],
    body: { x: -1.5, y: -1.7, width: 3.0, height: 3.4 }
  },
  {
    id: 'sot363',
    name: 'SOT-363 (SC-70-6)',
    description: 'SOT-363 / SC-70-6 SMD kılıf — 0.65 mm pitch',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -0.65, y: 0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' },
      { name: '2', x: 0, y: 0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' },
      { name: '3', x: 0.65, y: 0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' },
      { name: '4', x: 0.65, y: -0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' },
      { name: '5', x: 0, y: -0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' },
      { name: '6', x: -0.65, y: -0.575, shape: 'rect', width: 0.4, height: 0.7, layer: 'top' }
    ],
    silk: [...rectSilk(-1.0, -0.55, 2.0, 1.1, 0.1)],
    body: { x: -1.1, y: -1.1, width: 2.2, height: 2.2 }
  },
  {
    id: 'sot89',
    name: 'SOT-89',
    description: 'SOT-89 SMD güç kılıfı — 1.5 mm pitch + geniş kolektör pedi',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -1.5, y: 1.65, shape: 'rect', width: 0.7, height: 1.2, layer: 'top' },
      { name: '2', x: 0, y: 1.65, shape: 'rect', width: 0.7, height: 1.2, layer: 'top' },
      { name: '3', x: 1.5, y: 1.65, shape: 'rect', width: 0.7, height: 1.2, layer: 'top' },
      { name: 'TAB', x: 0, y: -0.9, shape: 'rect', width: 1.7, height: 1.8, layer: 'top' }
    ],
    silk: [...rectSilk(-2.3, -1.8, 4.6, 2.6, 0.12)],
    body: { x: -2.3, y: -1.8, width: 4.6, height: 4.65 }
  },
  {
    id: 'sot223',
    name: 'SOT-223',
    description: 'SOT-223 SMD regülatör kılıfı — 2.3 mm pitch + geniş tab (ör. AMS1117)',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -2.3, y: 3.2, shape: 'rect', width: 1.0, height: 2.0, layer: 'top' },
      { name: '2', x: 0, y: 3.2, shape: 'rect', width: 1.0, height: 2.0, layer: 'top' },
      { name: '3', x: 2.3, y: 3.2, shape: 'rect', width: 1.0, height: 2.0, layer: 'top' },
      { name: '4', x: 0, y: -3.0, shape: 'rect', width: 3.5, height: 2.0, layer: 'top' }
    ],
    silk: [...rectSilk(-3.3, -1.8, 6.6, 3.6, 0.15), { kind: 'text', x: 0, y: 0, text: '223', size: 1 }],
    body: { x: -3.3, y: -4.0, width: 6.6, height: 8.2 }
  },

  // ── Güç: DPAK / D2PAK (MOSFET, regülatör) ──
  {
    id: 'to252-dpak',
    name: 'TO-252 (DPAK)',
    description: 'DPAK SMD güç kılıfı — MOSFET/regülatör, geniş drain tab',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -2.28, y: 2.9, shape: 'rect', width: 0.9, height: 1.6, layer: 'top' },
      { name: '3', x: 2.28, y: 2.9, shape: 'rect', width: 0.9, height: 1.6, layer: 'top' },
      { name: 'TAB', x: 0, y: -1.4, shape: 'rect', width: 5.4, height: 3.0, layer: 'top' }
    ],
    silk: [...rectSilk(-3.1, -2.8, 6.2, 5.8, 0.15), { kind: 'text', x: 0, y: 3.9, text: 'DPAK', size: 0.9 }],
    body: { x: -3.1, y: -2.9, width: 6.2, height: 6.6 }
  },
  {
    id: 'to263-d2pak',
    name: 'TO-263 (D2PAK)',
    description: 'D2PAK SMD güç kılıfı — yüksek akım MOSFET/regülatör',
    category: 'Transistör & Regülatör',
    pads: [
      { name: '1', x: -2.54, y: 4.6, shape: 'rect', width: 1.2, height: 2.2, layer: 'top' },
      { name: '2', x: 0, y: 4.6, shape: 'rect', width: 1.2, height: 2.2, layer: 'top' },
      { name: '3', x: 2.54, y: 4.6, shape: 'rect', width: 1.2, height: 2.2, layer: 'top' },
      { name: 'TAB', x: 0, y: -1.8, shape: 'rect', width: 9.0, height: 4.8, layer: 'top' }
    ],
    silk: [...rectSilk(-5.1, -4.5, 10.2, 9.6, 0.15), { kind: 'text', x: 0, y: 6.2, text: 'D2PAK', size: 1 }],
    body: { x: -5.1, y: -4.5, width: 10.2, height: 10.7 }
  },

  // ── SMD Entegreler: SOP / TSSOP / SSOP / MSOP ──
  dualSmd('msop8', 'MSOP-8', 'MSOP-8 SMD kılıf — 0.65 mm pitch', 'Entegre (IC)', 8, 0.65, 4.4, 1.3, 0.4, 3.0, 3.0),
  dualSmd('tssop8', 'TSSOP-8', 'TSSOP-8 SMD kılıf — 0.65 mm pitch', 'Entegre (IC)', 8, 0.65, 5.4, 1.4, 0.45, 3.0, 4.4),
  dualSmd('tssop14', 'TSSOP-14', 'TSSOP-14 SMD kılıf — 0.65 mm pitch', 'Entegre (IC)', 14, 0.65, 5.4, 1.4, 0.45, 3.0, 5.0),
  dualSmd('tssop16', 'TSSOP-16', 'TSSOP-16 SMD kılıf — 0.65 mm pitch', 'Entegre (IC)', 16, 0.65, 5.4, 1.4, 0.45, 3.0, 5.0),
  dualSmd('tssop20', 'TSSOP-20', 'TSSOP-20 SMD kılıf — 0.65 mm pitch', 'Entegre (IC)', 20, 0.65, 5.4, 1.4, 0.45, 3.0, 6.5),
  dualSmd('ssop28', 'SSOP-28', 'SSOP-28 SMD kılıf — 0.65 mm pitch (ör. CH340, PCA9685)', 'Entegre (IC)', 28, 0.65, 7.4, 1.6, 0.45, 5.3, 10.2),
  dualSmd('sop8-wide', 'SOP-8 geniş (SO-8W)', 'Geniş gövdeli SOP-8 — 1.27 mm pitch, 7.5 mm gövde', 'Entegre (IC)', 8, 1.27, 9.4, 1.7, 0.6, 7.5, 5.0),

  // ── SMD Entegreler: QFP / LQFP / TQFP ──
  quadFlat('tqfp32', 'TQFP-32', 'TQFP-32 — 0.8 mm pitch, 7×7 mm gövde (ör. ATmega328P-AU)', 8, 0.8, 7.0, 1.5, 0.5, 8.4),
  quadFlat('tqfp44', 'TQFP-44', 'TQFP-44 — 0.8 mm pitch, 10×10 mm gövde (ör. ATmega16/32)', 11, 0.8, 10.0, 1.5, 0.5, 11.4),
  quadFlat('lqfp48', 'LQFP-48', 'LQFP-48 — 0.5 mm pitch, 7×7 mm gövde (ör. STM32F103)', 12, 0.5, 7.0, 1.4, 0.3, 8.4),
  quadFlat('lqfp64', 'LQFP-64', 'LQFP-64 — 0.5 mm pitch, 10×10 mm gövde (ör. STM32F4)', 16, 0.5, 10.0, 1.4, 0.3, 11.4),
  quadFlat('lqfp100', 'LQFP-100', 'LQFP-100 — 0.5 mm pitch, 14×14 mm gövde', 25, 0.5, 14.0, 1.4, 0.3, 15.4),

  // ── SMD Entegreler: QFN / DFN (no-lead + termal ped) ──
  quadFlat('qfn16', 'QFN-16', 'QFN-16 — 0.5 mm pitch, 3×3 mm + termal ped', 4, 0.5, 3.0, 0.75, 0.3, 2.9, true, 1.7),
  quadFlat('qfn20', 'QFN-20', 'QFN-20 — 0.5 mm pitch, 4×4 mm + termal ped', 5, 0.5, 4.0, 0.75, 0.3, 3.9, true, 2.6),
  quadFlat('qfn24', 'QFN-24', 'QFN-24 — 0.5 mm pitch, 4×4 mm + termal ped', 6, 0.5, 4.0, 0.75, 0.3, 3.9, true, 2.6),
  quadFlat('qfn32', 'QFN-32', 'QFN-32 — 0.5 mm pitch, 5×5 mm + termal ped (ör. ESP8266EX)', 8, 0.5, 5.0, 0.75, 0.3, 4.9, true, 3.4),
  quadFlat('qfn48', 'QFN-48', 'QFN-48 — 0.5 mm pitch, 6×6 mm + termal ped (ör. ESP32-D0WD)', 12, 0.5, 6.0, 0.75, 0.3, 5.9, true, 4.2),

  // ── SMD Konnektörler ──
  {
    id: 'usb-c-16',
    name: 'USB-C Dişi (16 pin SMD)',
    description: 'USB Type-C dişi soket — 16 SMT pad + 4 gövde tutturma delikli. Yaklaşık yerleşim',
    category: 'Konnektör',
    pads: (() => {
      const pads: PadDef[] = []
      const names = ['GND', 'CC2', 'DP2', 'DN2', 'SBU2', 'VBUS', 'GND2', 'DN1', 'DP1', 'CC1', 'VBUS2', 'SBU1']
      const startX = -((names.length - 1) * 0.5) / 2
      names.forEach((n, i) => {
        pads.push({ name: n, x: startX + i * 0.5, y: 4.3, shape: 'rect', width: 0.3, height: 1.2, layer: 'top' })
      })
      // Gövde tutturma pedleri (kenar)
      pads.push(
        { name: 'S1', x: -4.32, y: 1.0, shape: 'rect', width: 1.8, height: 2.0, layer: 'top' },
        { name: 'S2', x: 4.32, y: 1.0, shape: 'rect', width: 1.8, height: 2.0, layer: 'top' },
        { name: 'H1', x: -2.9, y: 1.6, shape: 'circle', width: 1.2, height: 1.2, drill: 0.65, layer: 'both' },
        { name: 'H2', x: 2.9, y: 1.6, shape: 'circle', width: 1.2, height: 1.2, drill: 0.65, layer: 'both' }
      )
      return pads
    })(),
    silk: [...rectSilk(-4.47, -1.6, 8.94, 4.5, 0.15), { kind: 'text', x: 0, y: -0.2, text: 'USB-C', size: 1 }],
    body: { x: -4.47, y: -1.6, width: 8.94, height: 6.6 }
  },
  {
    id: 'micro-usb-smd',
    name: 'Micro-USB Dişi (SMD)',
    description: 'Micro-USB Type-B dişi soket — 5 SMT pin + 4 gövde tutturma bacağı',
    category: 'Konnektör',
    pads: [
      ...['VBUS', 'DN', 'DP', 'ID', 'GND'].map((n, i) => ({
        name: n, x: -1.3 + i * 0.65, y: 2.5, shape: 'rect' as const, width: 0.4, height: 1.35, layer: 'top' as const
      })),
      { name: 'S1', x: -3.5, y: 1.0, shape: 'rect', width: 1.5, height: 1.9, layer: 'top' },
      { name: 'S2', x: 3.5, y: 1.0, shape: 'rect', width: 1.5, height: 1.9, layer: 'top' },
      { name: 'S3', x: -2.5, y: -2.5, shape: 'circle', width: 1.4, height: 1.4, drill: 0.9, layer: 'both' },
      { name: 'S4', x: 2.5, y: -2.5, shape: 'circle', width: 1.4, height: 1.4, drill: 0.9, layer: 'both' }
    ],
    silk: [...rectSilk(-3.6, -3.0, 7.2, 5.0, 0.15), { kind: 'text', x: 0, y: -0.5, text: 'µUSB', size: 0.9 }],
    body: { x: -3.6, y: -3.0, width: 7.2, height: 5.6 }
  }
]

/** Kategorilerin görüntülenme sırası */
export const footprintCategories = [
  'Mikrodenetleyici',
  'Motor Sürücü',
  'Direnç',
  'Kondansatör',
  'Diyot & LED',
  'Transistör & Regülatör',
  'Entegre (IC)',
  'Konnektör',
  'Buton & Mekanik',
  'Sensör & Modül',
  'Özel'
]

/** RefDes ön eki: kategoriye göre R1, C1, U1, J1... */
export function refDesPrefix(category: string): string {
  switch (category) {
    case 'Direnç': return 'R'
    case 'Kondansatör': return 'C'
    case 'Diyot & LED': return 'D'
    case 'Transistör & Regülatör': return 'Q'
    case 'Konnektör': return 'J'
    case 'Buton & Mekanik': return 'S'
    case 'Mikrodenetleyici':
    case 'Motor Sürücü':
    case 'Entegre (IC)': return 'U'
    case 'Sensör & Modül': return 'M'
    default: return 'X'
  }
}
