// ─── Metin girişi modalı ──────────────────────────────────────────────────
// Electron'da window.prompt desteklenmediği için promise tabanlı özel modal.

import { create } from 'zustand'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'

interface PromptRequest {
  title: string
  defaultValue: string
  placeholder?: string
  resolve: (value: string | null) => void
}

interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface PromptStore {
  request: PromptRequest | null
  confirmReq: ConfirmRequest | null
  ask: (title: string, defaultValue?: string, placeholder?: string) => Promise<string | null>
  confirm: (
    title: string,
    opts?: { message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
  ) => Promise<boolean>
  answer: (value: string | null) => void
  answerConfirm: (ok: boolean) => void
}

export const usePrompt = create<PromptStore>((set, get) => ({
  request: null,
  confirmReq: null,
  ask: (title, defaultValue = '', placeholder) =>
    new Promise<string | null>((resolve) => {
      // Önceki bekleyen istek varsa iptal et
      get().request?.resolve(null)
      set({ request: { title, defaultValue, placeholder, resolve } })
    }),
  confirm: (title, opts = {}) =>
    new Promise<boolean>((resolve) => {
      get().confirmReq?.resolve(false)
      set({
        confirmReq: {
          title,
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? 'Sil',
          cancelLabel: opts.cancelLabel,
          danger: opts.danger ?? true,
          resolve
        }
      })
    }),
  answer: (value) => {
    get().request?.resolve(value)
    set({ request: null })
  },
  answerConfirm: (ok) => {
    get().confirmReq?.resolve(ok)
    set({ confirmReq: null })
  }
}))

/** Uygulama kökünde bir kez render edilir */
export function PromptModal() {
  const request = usePrompt((s) => s.request)
  const confirmReq = usePrompt((s) => s.confirmReq)
  const answer = usePrompt((s) => s.answer)
  const answerConfirm = usePrompt((s) => s.answerConfirm)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const t = useT()

  useEffect(() => {
    if (request) {
      setValue(request.defaultValue)
      setTimeout(() => inputRef.current?.select(), 30)
    }
  }, [request])

  useEffect(() => {
    if (confirmReq) setTimeout(() => confirmBtnRef.current?.focus(), 30)
  }, [confirmReq])

  // ── Onay (evet/hayır) modalı ──
  if (confirmReq) {
    return (
      <div className="modal-backdrop" onMouseDown={() => answerConfirm(false)}>
        <div
          className="modal prompt-modal confirm-modal"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') answerConfirm(false)
            if (e.key === 'Enter') answerConfirm(true)
          }}
        >
          <h3>{confirmReq.title}</h3>
          {confirmReq.message && <p className="confirm-message">{confirmReq.message}</p>}
          <div className="modal-buttons">
            <button className="btn-secondary" onClick={() => answerConfirm(false)}>
              {confirmReq.cancelLabel ?? t('İptal')}
            </button>
            <button
              ref={confirmBtnRef}
              className={confirmReq.danger ? 'btn-primary btn-danger' : 'btn-primary'}
              onClick={() => answerConfirm(true)}
            >
              {t(confirmReq.confirmLabel)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!request) return null

  return (
    <div className="modal-backdrop" onMouseDown={() => answer(null)}>
      <div className="modal prompt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{request.title}</h3>
        <input
          ref={inputRef}
          value={value}
          placeholder={request.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') answer(value)
            if (e.key === 'Escape') answer(null)
            e.stopPropagation()
          }}
        />
        <div className="modal-buttons">
          <button className="btn-secondary" onClick={() => answer(null)}>
            {t('İptal')}
          </button>
          <button className="btn-primary" onClick={() => answer(value)}>
            {t('Tamam')}
          </button>
        </div>
      </div>
    </div>
  )
}
