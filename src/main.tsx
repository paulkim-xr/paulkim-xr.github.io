import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { App } from './app/App'
import { Capabilities } from './spike/Capabilities'
import { MicSpike } from './spike/MicSpike'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Temporary M0 spike routes. Both are deleted once the findings in
            docs/m0-spike-findings.md are recorded. */}
        <Route path="/spike" element={<Capabilities />} />
        <Route path="/spike/mic" element={<MicSpike />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
