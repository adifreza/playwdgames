import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Matikan menu konteks bawaan WebView2 supaya menu klik-kanan aplikasi
// (ContextMenu.tsx) yang muncul. Handler React onContextMenu tetap jalan.
window.addEventListener('contextmenu', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
