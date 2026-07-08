// ─── Tek pin için hızlı net atama popover'ı ───────────────────────────────
// Hem PCB editöründe (net aracıyla pad'e tıklayınca) hem şema editöründe
// (net aracıyla pin ucuna tıklayınca) kullanılır.

import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'

export function NetPopover({
  x,
  y,
  refDes,
  padName,
  current,
  suggest,
  onApply,
  onClose
}: {
  x: number
  y: number
  refDes: string
  padName: string
  current: string
  suggest: string
  onApply: (net: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [value, setValue] = useState(current || suggest)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const QUICK = ['GND', 'VCC', '5V', '3V3', '12V', 'VIN']
  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.min(y, window.innerHeight - 190)
  return (
    <>
      <div className="context-menu-backdrop" onMouseDown={onClose} />
      <div
        className="net-popover"
        style={{ position: 'fixed', left, top, zIndex: 160 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="net-popover-title">
          ⚡ {refDes} · {t('pad')} {padName}
        </div>
        <input
          ref={inputRef}
          value={value}
          placeholder={t('atanmamış')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') onApply(value)
            else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="net-popover-quick">
          {QUICK.map((n) => (
            <button key={n} onClick={() => onApply(n)}>
              {n}
            </button>
          ))}
          <button className="net-popover-clear" onClick={() => onApply('')}>
            {t('Temizle')}
          </button>
        </div>
        <div className="net-popover-actions">
          <button className="btn-secondary" onClick={onClose}>
            {t('İptal')}
          </button>
          <button className="btn-primary" onClick={() => onApply(value)}>
            ✓ {t('Uygula')}
          </button>
        </div>
      </div>
    </>
  )
}

/** Pad adından net adı öner: GND → GND, VCC → VCC */
export function suggestNetName(padName: string): string {
  if (/^(GND|VCC|VIN|3V3|5V|12V|AREF|RST)/i.test(padName)) return padName.toUpperCase()
  return ''
}
