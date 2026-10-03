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
import './index.css'
import { ThemeProvider } from './theme/ThemeProvider'
import App from './App.tsx'
import { startOutbox } from './lib/outbox'
import { sendRaw } from './api/client'
import { carryOverFollows } from './lib/identity'

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
        <App />
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
