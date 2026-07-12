// ─── Vektör ikon seti ─────────────────────────────────────────────────────
// Uygulamadaki emojilerin yerine kullanılan, elle çizilmiş tek renk (currentColor)
// SVG ikonlar. EAGLE/Fusion benzeri profesyonel, tutarlı bir görünüm sağlar.
// Her ikon 24×24 viewBox içinde; `stroke="currentColor"` ile çizilir, böylece
// metin rengini ve buton durumlarını (hover/active) otomatik izler.

import type { CSSProperties } from 'react'

/** İkon adı → iç SVG işaretlemesi. viewBox 0 0 24 24 kabul edilir. */
const ICONS: Record<string, string> = {
  // ── İşaretçi / seçim ──
  select:
    '<path d="M5 3.5 L5 18.5 L8.7 14.7 L11.3 20.2 L13.4 19.2 L10.8 13.8 L15.5 13.7 Z" fill="currentColor" stroke="currentColor" stroke-width="1"/>',
  // ── PCB araçları ──
  trace:
    '<circle cx="5" cy="7" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="17" r="1.7" fill="currentColor" stroke="none"/><path d="M5 7 H10 L14 17 H19"/>',
  via: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  zone:
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M6.5 17 L12.5 8 M9.5 18 L16 8.5 M13 18 L18 11" stroke-width="1"/>',
  text: '<path d="M6 19 L12 5 L18 19 M8.7 14 H15.3"/>',
  net: '<path d="M13 2 L5 13 H11 L10 22 L19 10 H12.5 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  measure:
    '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M6.5 8 V11.5 M10 8 V13 M13.5 8 V11.5 M17 8 V13" stroke-width="1.3"/>',
  trash:
    '<path d="M4 6 H20 M9.5 6 V4.2 H14.5 V6 M6.6 6 L7.6 20 H16.4 L17.4 6 M10 10 V16 M14 10 V16"/>',
  // ── Şema araçları ──
  wire:
    '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M6.7 12 H12 L14 8 H17.3"/>',
  cut: '<circle cx="6" cy="7" r="2.2"/><circle cx="6" cy="17" r="2.2"/><path d="M7.9 8.3 L20 16 M7.9 15.7 L20 8"/>',
  link:
    '<path d="M9.5 12 H14.5"/><path d="M10 8 H8.2 A4 4 0 0 0 8.2 16 H10 M14 8 H15.8 A4 4 0 0 1 15.8 16 H14"/>',
  block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6 L18 18"/>',
  // ── Üst çubuk / mod sekmeleri ──
  home: '<path d="M4 11 L12 4 L20 11 M6 9.4 V19 H18 V9.4 M10 19 V14 H14 V19"/>',
  newfile:
    '<path d="M7 3 H13.5 L18 7.5 V20 A1 1 0 0 1 17 21 H7 A1 1 0 0 1 6 20 V4 A1 1 0 0 1 7 3 Z M13.5 3 V7.5 H18"/>',
  folder:
    '<path d="M4 7.2 A1.2 1.2 0 0 1 5.2 6 H9 L11 8 H18.8 A1.2 1.2 0 0 1 20 9.2 V16.8 A1.2 1.2 0 0 1 18.8 18 H5.2 A1.2 1.2 0 0 1 4 16.8 Z"/>',
  save: '<path d="M5 4 H16 L20 8 V18.8 A1.2 1.2 0 0 1 18.8 20 H5.2 A1.2 1.2 0 0 1 4 18.8 V5 A1 1 0 0 1 5 4 Z M8 4 V9 H15 V4 M7.5 20 V13 H16.5 V20"/>',
  saveas:
    '<path d="M5 4 H14 L19 9 V13 M4 5 V18.8 A1.2 1.2 0 0 0 5.2 20 H11 M8 4 V9 H14 V5 M17 15 V22 M13.5 18.5 H20.5" stroke-width="1.5"/>',
  undo: '<path d="M8 7 L4 11 L8 15 M4 11 H13.5 A5 5 0 0 1 13.5 21 H10"/>',
  redo: '<path d="M16 7 L20 11 L16 15 M20 11 H10.5 A5 5 0 0 0 10.5 21 H14"/>',
  robot:
    '<rect x="5" y="8" width="14" height="11" rx="2.5"/><path d="M12 4.8 V8 M3 12 V15 M21 12 V15"/><circle cx="12" cy="3.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9.6" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.4" cy="13" r="1.2" fill="currentColor" stroke="none"/>',
  drc: '<path d="M12 3 L19 6 V11 C19 16 15.5 19 12 21 C8.5 19 5 16 5 11 V6 Z"/><path d="M9 12 L11.2 14.3 L15.5 9.4"/>',
  calc:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="3" rx="0.5"/><path d="M9 13 H9.01 M12 13 H12.01 M15 13 H15.01 M9 17 H9.01 M12 17 H12.01 M15 17 H15.01" stroke-width="2" stroke-linecap="round"/>',
  chip:
    '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9.5 7 V4 M12 7 V4 M14.5 7 V4 M9.5 17 V20 M12 17 V20 M14.5 17 V20 M7 9.5 H4 M7 12 H4 M7 14.5 H4 M17 9.5 H20 M17 12 H20 M17 14.5 H20"/><circle cx="9.7" cy="9.7" r="0.9" fill="currentColor" stroke="none"/>',
  gear:
    '<circle cx="12" cy="12" r="3.1"/><path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M18.4 5.6 L16.2 7.8 M7.8 16.2 L5.6 18.4"/>',
  board:
    '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 8 H12 V12 H16 M8 16 H13.5" stroke-width="1.3"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/>',
  export: '<path d="M12 4 V15 M8 11 L12 15.2 L16 11 M5 19 H19"/>',
  schematic:
    '<path d="M3 12 H6 L7.4 8.5 L9.6 15.5 L11.8 8.5 L14 15.5 L15.4 12 H21"/>',
  pcb: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M7 7 H11 V11 H15 M7 15 H12.5" stroke-width="1.3"/><circle cx="7" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="15" r="1.1" fill="currentColor" stroke="none"/>',
  boardedit:
    '<rect x="4" y="7" width="16" height="11" rx="1" stroke-dasharray="2.4 2"/><path d="M4 4 H20 M4 3.2 V4.8 M20 3.2 V4.8" stroke-width="1.3"/>',
  cube: '<path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z M4 7.5 L12 12 L20 7.5 M12 12 V21"/>',
  hex: '<path d="M8 4 H16 L20 12 L16 20 H8 L4 12 Z"/>',
  // ── Görünüm / 3B ──
  viewtop: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><path d="M4.5 12 H19.5 M12 4.5 V19.5" stroke-width="1"/>',
  viewbottom: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><path d="M4.5 12 H19.5" stroke-width="1"/><path d="M7 16 H17" stroke-width="1"/>',
  viewfront: '<rect x="4" y="9" width="16" height="7" rx="1"/><path d="M4 12.5 H20" stroke-width="1"/>',
  layers: '<path d="M12 3 L21 8 L12 13 L3 8 Z M3 12 L12 17 L21 12 M3 16 L12 21 L21 16"/>',
  camera:
    '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7 L9.5 4.5 H14.5 L16 7"/><circle cx="12" cy="13" r="3.3"/>',
  tag: '<path d="M4 11 L11 4 H18.8 A1.2 1.2 0 0 1 20 5.2 V13 L13 20 Z"/><circle cx="15.8" cy="8.2" r="1.3"/>',
  plus: '<path d="M12 5 V19 M5 12 H19"/>',
  move: '<path d="M12 3 V21 M3 12 H21 M12 3 L9.6 6 M12 3 L14.4 6 M12 21 L9.6 18 M12 21 L14.4 18 M3 12 L6 9.6 M3 12 L6 14.4 M21 12 L18 9.6 M21 12 L18 14.4"/>',
  fullscreen: '<path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15"/>',
  fullscreenExit: '<path d="M4 8 H8 V4 M16 4 V8 H20 M20 16 H16 V20 M8 20 V16 H4"/>',
  close: '<path d="M6 6 L18 18 M18 6 L6 18"/>',
  check: '<path d="M5 12.5 L10 17.5 L19 6.5"/>',
  star: '<path d="M12 3 L14.6 9.1 L21 9.7 L16.1 14 L17.6 20.4 L12 17 L6.4 20.4 L7.9 14 L3 9.7 L9.4 9.1 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  starOutline:
    '<path d="M12 3 L14.6 9.1 L21 9.7 L16.1 14 L17.6 20.4 L12 17 L6.4 20.4 L7.9 14 L3 9.7 L9.4 9.1 Z"/>',
  edit: '<path d="M4 20 L4.8 15.8 L15.8 4.8 A2 2 0 0 1 19.2 8.2 L8.2 19.2 Z M13.8 6.8 L17.2 10.2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="M15.2 15.2 L20 20"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.8"/><path d="M4.5 17.5 L10 12 L14 15.5 L17 13 L20 16"/>',
  refresh: '<path d="M19 12 A7 7 0 1 1 16.3 6.4 M16.5 3 V7 H12.5"/>',
  hourglass: '<path d="M6 4 H18 M6 20 H18 M7.5 4 L12 11 L16.5 4 M7.5 20 L12 13 L16.5 20"/>',
  play: '<path d="M7 5 L18 12 L7 19 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
  package: '<path d="M12 3 L20 7 V16.5 L12 21 L4 16.5 V7 Z M4 7 L12 11.4 L20 7 M12 11.4 V21 M8 5 L16 9.4" stroke-width="1.4"/>',
  ruler: '<path d="M4 20 L20 4 L14 3 L15 8 L11 9 L12 14 L8 15 L9 20 Z" stroke-width="1.3"/>',
  pen: '<path d="M4 20 L5.5 15 L15 5.5 A2.1 2.1 0 0 1 18.5 9 L9 18.5 Z M13 7.5 L16.5 11 M5.5 15 L9 18.5"/>',
  map: '<path d="M4 6 L9 4 L15 6 L20 4 V18 L15 20 L9 18 L4 20 Z M9 4 V18 M15 6 V20"/>',
  patch: '<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-40 12 12)"/><path d="M9.5 9.5 L14.5 14.5 M14.5 9.5 L9.5 14.5" stroke-width="1"/>',
  puzzle:
    '<path d="M9 4 H12 A2 2 0 1 1 15 4 H18 V8 A2 2 0 1 0 18 12 V16 H14 A2 2 0 1 0 10 16 H6 V12 A2 2 0 1 0 6 8 V4 Z"/>',
  clipboard:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8.5 11 H15.5 M8.5 14.5 H13.5"/>',
  dot: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>'
}

export type IconName = keyof typeof ICONS

export interface IconProps {
  name: IconName
  /** Piksel boyutu (kare). Varsayılan 18. */
  size?: number
  strokeWidth?: number
  className?: string
  title?: string
  style?: CSSProperties
}

/** Tek renk (currentColor) vektör ikon. */
export function Icon({ name, size = 18, strokeWidth = 1.7, className, title, style }: IconProps) {
  const inner = ICONS[name] ?? ICONS.dot
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: 'none', ...style }}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + inner }}
    />
  )
}
