import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const privacyCacheVersion = 'auth-privacy-v2'

async function refreshLegacyAppCache() {
  if (!('caches' in window) || localStorage.getItem('privacy-cache-version') === privacyCacheVersion) return

  localStorage.setItem('privacy-cache-version', privacyCacheVersion)
  const cacheNames = await caches.keys()
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
}

refreshLegacyAppCache().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
