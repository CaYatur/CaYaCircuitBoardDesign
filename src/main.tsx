import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { useStore } from './state/store'
import { useUserLibrary } from './state/userLibrary'
import { usePrompt } from './ui/prompts'

// Geliştirme/otomasyon için store'ları konsola aç
if (import.meta.env.DEV) {
  ;(window as any).__caya = useStore
  ;(window as any).__cayaLib = useUserLibrary
  ;(window as any).__cayaPrompt = usePrompt
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
