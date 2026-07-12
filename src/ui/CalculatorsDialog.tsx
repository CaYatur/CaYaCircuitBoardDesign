// ─── Elektriksel hesaplayıcılar ───────────────────────────────────────────
// IPC-2221 iz genişliği, via akımı, iz direnci/gerilim düşümü, mikroşerit
// empedansı. Tüm hesaplar canlı güncellenir.

import { useState } from 'react'
import { useStore } from '../state/store'
import {
  currentForTraceWidth,
  formatOhm,
  microstripImpedance,
  traceVoltageDrop,
  traceWidthForCurrent,
  viaCurrentCapacity
} from '../core/calculations'
import { useT } from '../i18n'
import { Icon } from './Icon'

type Tab = 'trace' | 'via' | 'resistance' | 'impedance'

export function CalculatorsDialog() {
  const activeDialog = useStore((s) => s.activeDialog)
  const openDialog = useStore((s) => s.openDialog)
  const [tab, setTab] = useState<Tab>('trace')
  const t = useT()

  if (activeDialog !== 'calculators') return null

  return (
    <div className="modal-backdrop" onMouseDown={() => openDialog(null)}>
      <div className="modal calc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="calc" size={16} /> {t('Elektriksel Hesaplayıcılar')}</h3>
          <button onClick={() => openDialog(null)}><Icon name="close" size={14} /></button>
        </div>
        <div className="tabs">
          <button className={tab === 'trace' ? 'active' : ''} onClick={() => setTab('trace')}>
            {t('İz Genişliği (IPC-2221)')}
          </button>
          <button className={tab === 'via' ? 'active' : ''} onClick={() => setTab('via')}>
            {t('Via Akımı')}
          </button>
          <button className={tab === 'resistance' ? 'active' : ''} onClick={() => setTab('resistance')}>
            {t('Direnç & Gerilim Düşümü')}
          </button>
          <button className={tab === 'impedance' ? 'active' : ''} onClick={() => setTab('impedance')}>
            {t('Empedans')}
          </button>
        </div>
        {tab === 'trace' && <TraceWidthCalc />}
        {tab === 'via' && <ViaCalc />}
        {tab === 'resistance' && <ResistanceCalc />}
        {tab === 'impedance' && <ImpedanceCalc />}
      </div>
    </div>
  )
}

function Num({
  label,
  value,
  set,
  step = 0.1,
  unit
}: {
  label: string
  value: number
  set: (v: number) => void
  step?: number
  unit?: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-unit">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => set(parseFloat(e.target.value) || 0)}
        />
        {unit && <span>{unit}</span>}
      </div>
    </div>
  )
}

function TraceWidthCalc() {
  const commit = useStore((s) => s.commit)
  const openDialog = useStore((s) => s.openDialog)
  const t = useT()
  const [current, setCurrent] = useState(1)
  const [tempRise, setTempRise] = useState(10)
  const [oz, setOz] = useState(1)

  const wExt = traceWidthForCurrent(current, tempRise, oz, true)
  const wInt = traceWidthForCurrent(current, tempRise, oz, false)
  const suggested = Math.max(0.15, Math.ceil(wExt * 20) / 20)

  return (
    <div className="calc-body">
      <Num label={t('Akım')} value={current} set={setCurrent} unit="A" />
      <Num label={t('Sıcaklık artışı')} value={tempRise} set={setTempRise} step={1} unit="°C" />
      <Num label={t('Bakır ağırlığı')} value={oz} set={setOz} step={0.5} unit="oz/ft²" />
      <div className="calc-result">
        <div>
          {t('Dış katman minimum genişlik')}: <b>{wExt.toFixed(3)} mm</b>
        </div>
        <div>
          {t('İç katman minimum genişlik')}: <b>{wInt.toFixed(3)} mm</b>
        </div>
        <div className="calc-note">
          {t('Çift katmanlı kartta her iki katman da "dış katman" sayılır.')}
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            commit((p) => {
              p.settings.defaultTraceWidth = suggested
            }, t('Varsayılan iz genişliği {w} mm yapıldı', { w: suggested }))
            openDialog(null)
          }}
        >
          {t('Bu genişliği varsayılan yap')} ({suggested} mm)
        </button>
      </div>
    </div>
  )
}

function ViaCalc() {
  const t = useT()
  const [drill, setDrill] = useState(0.4)
  const [tempRise, setTempRise] = useState(10)
  const [plating, setPlating] = useState(25)

  const cap = viaCurrentCapacity(drill, tempRise, plating)

  return (
    <div className="calc-body">
      <Num label={t('Delik çapı')} value={drill} set={setDrill} step={0.05} unit="mm" />
      <Num label={t('Sıcaklık artışı')} value={tempRise} set={setTempRise} step={1} unit="°C" />
      <Num label={t('Kaplama kalınlığı')} value={plating} set={setPlating} step={5} unit="µm" />
      <div className="calc-result">
        <div>
          {t('Via akım kapasitesi')}: <b>{cap.toFixed(2)} A</b>
        </div>
        <div className="calc-note">
          {t('Yüksek akımlar için birden fazla paralel via kullanın.')}
        </div>
      </div>
    </div>
  )
}

function ResistanceCalc() {
  const t = useT()
  const [length, setLength] = useState(50)
  const [width, setWidth] = useState(0.4)
  const [oz, setOz] = useState(1)
  const [current, setCurrent] = useState(1)

  const r = traceVoltageDrop(length, width, oz, current)
  const maxI = currentForTraceWidth(width, 10, oz, true)

  return (
    <div className="calc-body">
      <Num label={t('İz uzunluğu')} value={length} set={setLength} step={1} unit="mm" />
      <Num label={t('İz genişliği')} value={width} set={setWidth} step={0.05} unit="mm" />
      <Num label={t('Bakır ağırlığı')} value={oz} set={setOz} step={0.5} unit="oz/ft²" />
      <Num label={t('Akım')} value={current} set={setCurrent} unit="A" />
      <div className="calc-result">
        <div>{t('Direnç')}: <b>{formatOhm(r.resistance)}</b></div>
        <div>{t('Gerilim düşümü')}: <b>{(r.voltageDrop * 1000).toFixed(2)} mV</b></div>
        <div>{t('Güç kaybı')}: <b>{(r.powerLoss * 1000).toFixed(2)} mW</b></div>
        <div>
          {t('Bu genişliğin taşıyabileceği akım (ΔT=10°C)')}: <b>{maxI.toFixed(2)} A</b>
        </div>
      </div>
    </div>
  )
}

function ImpedanceCalc() {
  const t = useT()
  const [w, setW] = useState(0.3)
  const [h, setH] = useState(1.5)
  const [tk, setTk] = useState(0.035)
  const [er, setEr] = useState(4.5)

  const z = microstripImpedance(w, h, tk, er)

  return (
    <div className="calc-body">
      <Num label={t('İz genişliği')} value={w} set={setW} step={0.05} unit="mm" />
      <Num label={t('Dielektrik kalınlığı (FR4)')} value={h} set={setH} step={0.1} unit="mm" />
      <Num label={t('Bakır kalınlığı')} value={tk} set={setTk} step={0.005} unit="mm" />
      <Num label={t('Bağıl geçirgenlik (εr)')} value={er} set={setEr} step={0.1} />
      <div className="calc-result">
        <div>
          {t('Mikroşerit empedansı')}: <b>{z.toFixed(1)} Ω</b>
        </div>
        <div className="calc-note">
          {t('IPC-2141 yaklaşımı — 1.6 mm FR4 için tipik εr = 4.5. 50 Ω hedefi için genişliği ayarlayın.')}
        </div>
      </div>
    </div>
  )
}
