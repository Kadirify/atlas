import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PanelApp from './PanelApp'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Aynı paket iki pencerede çalışır: ana pencere ve ekranın sağında açılan panel. */}
    {window.location.hash === '#panel' ? <PanelApp /> : <App />}
  </StrictMode>
)
