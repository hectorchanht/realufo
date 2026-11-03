import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from './api/queryClient'
import '@fontsource/press-start-2p'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './theme/theme.css'
// Same hashed files the @font-face rules above point at (Vite dedupes the asset),
// preloaded so the body + label faces don't wait for first layout to start loading.
import groteskUrl from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2?url'
import monoUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url'
import './index.css'
import { ThemeProvider } from './theme/ThemeProvider'
import { LangProvider } from './lib/lang'
import App from './App.tsx'
import { startOutbox } from './lib/outbox'
import { sendRaw } from './api/client'
import { carryOverFollows } from './lib/identity'
import { guardTranslatedDom } from './lib/translateGuard'

for (const href of [groteskUrl, monoUrl]) {
  const l = Object.assign(document.createElement('link'), { rel: 'preload', as: 'font', type: 'font/woff2', href, crossOrigin: 'anonymous' })
  document.head.appendChild(l)
}

// Before the first render: browser translate must not crash React (lib/translateGuard.ts).
guardTranslatedDom()

const queryClient = makeQueryClient()

// Offline writes (lib/outbox.ts): replay on start/online/visible; refetch everything once sent.
startOutbox(sendRaw, () => void queryClient.invalidateQueries())

// After an ID import (lib/identity.ts): copy the old id's follows to the new one;
// the push resync below waits for it so the subscription moves to the new id too.
const carried = carryOverFollows()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

// Service worker (public/sw.js): offline shell, saved reads, push. Production only —
// in dev it would cache Vite's unhashed modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {})
    void carried.then(() => import('./lib/push')).then((m) => m.resyncPush())
  })
}
