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

        {/* Both render the same App so entering a room never remounts the
            canvas — a remount would tear down the WebGL context. */}
        <Route path="/" element={<App />} />
        <Route path="/p/:id" element={<App />} />
        {/* Unknown paths land on the hub rather than a dead end. */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
