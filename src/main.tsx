import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { lazy, Suspense } from 'react'
import { App } from './app/App'
import { Capabilities } from './spike/Capabilities'
import { MicSpike } from './spike/MicSpike'

// Code-split: the lab pieces are whole scenes of their own and must not sit in
// the bundle everyone downloads to look at the hub.
const CirclesPage = lazy(() =>
  import('./lab/routes').then((module) => ({ default: module.CirclesPage })),
)
const GravityPage = lazy(() =>
  import('./lab/routes').then((module) => ({ default: module.GravityPage })),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Temporary M0 spike routes. Both are deleted once the findings in
            docs/m0-spike-findings.md are recorded. */}
        <Route path="/spike" element={<Capabilities />} />
        <Route path="/spike/mic" element={<MicSpike />} />

        {/* The lab: earlier three.js pieces, kept as experiences in their own
            right rather than folded into the five projects. */}
        <Route
          path="/lab/circles"
          element={
            <Suspense fallback={null}>
              <CirclesPage />
            </Suspense>
          }
        />
        <Route
          path="/lab/gravity"
          element={
            <Suspense fallback={null}>
              <GravityPage />
            </Suspense>
          }
        />

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
