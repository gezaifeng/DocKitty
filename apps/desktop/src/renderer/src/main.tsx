// apps/desktop/src/renderer/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './assets/globals.css'
import './assets/themes.css'
import './assets/extra-themes.css'
import './assets/liquid-glass.css'
import './assets/redline.css'
import './vendor/ak-ui/scoped.css'
import './assets/ak-ui.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000 } },
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
