# XR-Native Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, deep-linkable React Three Fiber homepage where five projects sit on a 3D carousel and zooming into one fades through a monochrome void into that project's room — working identically flat in a browser and immersively on a Quest 2.

**Architecture:** A single Vite SPA. All routing state lives in the outer React tree and is passed into `<Canvas>` as props (never as context — R3F uses a separate reconciler root). A pure reducer owns the carousel→void→room transition and gates the reveal on *both* the mask animation and the lazy scene's resolution. Every project satisfies one `Room` interface; four render through a shared exhibit template, and any project can later graduate to a bespoke scene by changing one `import`.

**Tech Stack:** Vite 8, React 19, TypeScript 6, @react-three/fiber 9, @react-three/drei 10, @react-three/xr 6, three 0.184, react-router 7, zod, Vitest, Playwright, GitHub Actions → GitHub Pages.

**Source spec:** [`docs/specs/2026-08-03-xr-homepage-design.md`](../specs/2026-08-03-xr-homepage-design.md)

**Scope of this plan:** Spec milestones **M0 → M1 → M2 → M4**. It ends with a live, deployed site containing five projects, all reachable in flat and XR. Spec milestone **M3** (the bespoke `papercup` audio-reactive string room) is deliberately excluded and gets its own plan — the spec states M2 is a genuine, complete site and that M3 does not block it. Task 17 is the on-device performance pass that M4 requires.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Root-served.** The repo is `paulkim-xr/paulkim-xr.github.io`, a user-scoped Pages site serving at the domain root. **Never set Vite `base`.** All asset URLs are absolute from `/`.
- **No server.** No database, no authenticated surface, no runtime secrets. The build output is a static `dist/`.
- **Flat mode is a complete experience, not a degraded one.** Every capability reachable in XR must be reachable flat.
- **XR mode is `immersive-vr` only.** `immersive-ar` / passthrough is out of scope for v1.
- **Teleport locomotion only.** No smooth locomotion — it is the primary nausea source.
- **The "Enter VR" affordance renders only when** `navigator.xr?.isSessionSupported('immersive-vr')` resolves `true`.
- **Deep links are real paths:** `/` is the hub, `/p/:id` is a room. Not hash routing.
- **Transition invariant 1:** non-interruptible once past `masking`. A fast double-select must not start two loads.
- **Transition invariant 2:** the mask holds until **both** the animation has completed **and** Suspense has resolved. Never a spinner, never a cut to a half-loaded room.
- **Quest 2 performance budget** — 72Hz, 13.8ms/frame. Draw calls and overdraw are the killers, not triangle count:
  - Instance the carousel
  - **No postprocessing in XR**
  - Textures ≤1024 for panels
  - Baked lighting; no realtime shadows in XR
  - Target **<100 draw calls per room**
- **Coverage:** the global 80% rule applies to `src/lib/`, `src/transition/`, `src/hub/ring.ts`, and `src/content/`. It is deliberately **not** pursued for R3F scene components — asserting on a three.js scene graph tests three.js, not this codebase. This deviation was raised and accepted in the spec.
- **Commit identity** in this repo is `Paul Kim <paul.kim.dev@gmail.com>` (already set repo-locally). Conventional-commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. No AI attribution trailers.
- **Projects in scope (exactly five):** `papercup`, `SkiWatch`, `open-ski-data`, `project-beta`, `cli-p2p-boardgame`. Nothing else is presentable.

---

## File Structure

```
paulkim-xr.github.io/
├── .github/workflows/deploy.yml     Actions → Pages
├── index.html                        includes the spa-github-pages decode snippet
├── package.json
├── vite.config.ts                    dev server host/allowedHosts + vitest config
├── tsconfig.json / tsconfig.node.json
├── playwright.config.ts
├── public/
│   ├── .nojekyll                     stops Jekyll eating _-prefixed files
│   ├── 404.html                      spa-github-pages redirect shim
│   └── fonts/display.ttf             self-hosted; troika must not hit a CDN
├── docs/
│   ├── specs/2026-08-03-xr-homepage-design.md
│   ├── plans/2026-08-04-xr-homepage-implementation.md   ← this file
│   └── m0-spike-findings.md          written by Tasks 2–3
└── src/
    ├── main.tsx                      React root + BrowserRouter
    ├── app/
    │   ├── App.tsx                   reads router state, owns <Canvas>, passes props down
    │   ├── Stage.tsx                 everything inside <Canvas>; pure props, no router hooks
    │   └── EnterXrButton.tsx         DOM overlay button, gated on XR support
    ├── hub/
    │   ├── ring.ts                   pure carousel ring math                    [tested]
    │   ├── Carousel3D.tsx            the project ring
    │   └── previews/                 one small R3F component per project
    │       ├── PapercupPreview.tsx  SkiWatchPreview.tsx  OpenSkiDataPreview.tsx
    │       └── ProjectBetaPreview.tsx  BoardgamePreview.tsx
    ├── transition/
    │   ├── machine.ts                pure reducer + guards                      [tested]
    │   ├── useTransition.ts          React binding for the reducer
    │   ├── VoidMask.tsx              flat + XR renderings of the void
    │   └── SceneGate.tsx             fires onReady when a lazy scene mounts
    ├── exhibit/
    │   ├── Exhibit.tsx               the template room (default export)
    │   ├── Plinth.tsx                pedestal geometry
    │   └── InfoPanel.tsx             title + blurb + link targets
    ├── rooms/                        (empty in this plan; M3 adds rooms/papercup/)
    ├── content/
    │   ├── schema.ts                 zod schemas + inferred types              [tested]
    │   ├── projects.ts               copy, links, metadata — plain data only
    │   └── registry.tsx              binds data → Room (preview/scene refs)    [tested]
    ├── xr/
    │   ├── store.ts                  createXRStore singleton
    │   ├── useXrSupport.ts           isSessionSupported probe                  [tested]
    │   └── TeleportFloor.tsx         teleport target + XROrigin plumbing
    └── lib/
        └── damp.ts                   frame-rate-independent easing             [tested]

tests/
├── unit/                             Vitest — mirrors src/ paths
└── e2e/homepage.spec.ts              Playwright flat-mode smoke
```

**Why these boundaries:** `ring.ts`, `machine.ts`, `schema.ts` and `damp.ts` hold every decision that can be wrong in a way a test can catch — they are pure and carry the coverage requirement. Everything under `hub/`, `exhibit/`, `xr/` and `previews/` is scene-graph assembly, where tests would only exercise three.js. `content/projects.ts` is data so a copy edit never touches a component, and `content/registry.tsx` is the one place that knows both data and components.

---

## Task 1: Project scaffold and toolchain

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/lib/damp.ts`
- Test: `tests/unit/lib/damp.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `damp(current: number, target: number, lambda: number, dt: number): number` from `src/lib/damp.ts`. Every animated value in later tasks uses this rather than a fixed per-frame lerp.

- [ ] **Step 1: Initialise the package and install dependencies**

Run from the repo root (`/home/papercup/workspaces/paulkim-xr.github.io`):

```bash
npm init -y
npm pkg set name="paulkim-xr-homepage" private=true type="module" version="0.0.0"
npm pkg delete main

npm install react@^19.2.6 react-dom@^19.2.6 three@^0.184.0 \
  @react-three/fiber@^9.6.1 @react-three/xr@^6.6.29 \
  @react-three/drei@latest react-router@latest zod@latest

npm install -D vite@^8.0.14 @vitejs/plugin-react@^6.0.2 typescript@^6.0.3 \
  @types/react@^19.2.15 @types/react-dom@^19.2.3 @types/three@^0.184.1 \
  vitest@latest @vitest/coverage-v8@latest jsdom@latest @playwright/test@latest
```

Two compatibility constraints that `@latest` must satisfy — check them after install:

- `@react-three/drei` must resolve to the **v10 line or newer**. Drei v9 targets R3F v8 and will fail against R3F 9 / React 19.
- `react-router` v7 exports `BrowserRouter`, `Routes`, `Route`, `useParams`, `useNavigate` from the **`react-router`** package directly. Do **not** install `react-router-dom`.

Verify: `npm ls @react-three/drei react-router` and confirm drei is `10.x` or higher.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/lib/damp.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { damp } from '../../../src/lib/damp'

describe('damp', () => {
  test('returns the current value when dt is zero', () => {
    expect(damp(2, 10, 5, 0)).toBe(2)
  })

  test('moves toward the target but never past it', () => {
    const result = damp(0, 10, 5, 0.016)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(10)
  })

  test('converges to the target over many frames', () => {
    let value = 0
    for (let i = 0; i < 200; i++) value = damp(value, 10, 5, 0.016)
    expect(value).toBeCloseTo(10, 3)
  })

  test('is frame-rate independent: one big step matches many small ones', () => {
    const oneStep = damp(0, 10, 5, 0.1)

    let many = 0
    for (let i = 0; i < 10; i++) many = damp(many, 10, 5, 0.01)

    expect(oneStep).toBeCloseTo(many, 6)
  })
})
```

The fourth test is the reason this function exists. A naive `current + (target - current) * 0.1` gives different results at 60Hz and 72Hz, so a Quest would animate at a visibly different speed from a laptop.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/lib/damp.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/lib/damp"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/damp.ts`:

```ts
/**
 * Frame-rate-independent exponential easing.
 *
 * `lambda` is the decay rate: higher is snappier. The remaining distance is
 * multiplied by e^(-lambda * dt) each call, so the result depends only on
 * elapsed time — not on how many frames that time was split into.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/lib/damp.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the config files**

`vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // NO `base` option. This is a user-scoped Pages site and serves at the
  // domain root. Setting base would break every absolute asset URL.
  server: {
    host: true, // bind 0.0.0.0 so the Tailscale funnel can reach the dev server
    port: 5173,
    // Vite rejects requests whose Host header it does not recognise with
    // "Blocked request. This host is not allowed." The funnel arrives with the
    // tailnet hostname, so it must be listed or the Quest gets a 403 that
    // looks nothing like a host-header problem.
    allowedHosts: ['snowple.tail709630.ts.net', '.ts.net'],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/transition/machine.ts', 'src/content/**', 'src/hub/ring.ts', 'src/xr/useXrSupport.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
test-results/
playwright-report/
.DS_Store
*.local
```

Add scripts:

```bash
npm pkg set scripts.dev="vite" \
  scripts.build="tsc -b && vite build" \
  scripts.preview="vite preview --port 4173" \
  scripts.test="vitest run" \
  scripts.test:watch="vitest" \
  scripts.coverage="vitest run --coverage" \
  scripts.e2e="playwright test"
```

- [ ] **Step 7: Write the entry point and a bare app**

`index.html` — note the decode snippet, which must run **before** the app module so the URL is corrected before the router reads it:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Paul Kim — XR</title>
    <meta name="description" content="Personal homepage and WebXR lab of Paul Kim." />
    <!-- spa-github-pages decode: 404.html redirects /p/foo to /?/p/foo, and this
         rewrites it back before React Router ever sees the location. -->
    <script type="text/javascript">
      (function (l) {
        if (l.search[1] === '/') {
          var decoded = l.search
            .slice(1)
            .split('&')
            .map(function (s) {
              return s.replace(/~and~/g, '&')
            })
            .join('?')
          window.history.replaceState(null, null, l.pathname.slice(0, -1) + decoded + l.hash)
        }
      })(window.location)
    </script>
    <style>
      html, body, #root { margin: 0; height: 100%; background: #000; overflow: hidden; }
      body { font-family: system-ui, sans-serif; color: #fff; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

`src/app/App.tsx` — a placeholder canvas, replaced in Task 11:

```tsx
import { Canvas } from '@react-three/fiber'

export function App() {
  return (
    <Canvas camera={{ position: [0, 1.6, 6], fov: 55 }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.6} />
      <mesh>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
        <meshStandardMaterial color="#8888ff" />
      </mesh>
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
    </Canvas>
  )
}
```

- [ ] **Step 8: Verify the build and dev server**

Run: `npm run build`
Expected: `tsc -b` passes with no errors, and Vite writes `dist/`.

Run: `npm run dev`, open `http://localhost:5173`, confirm a shaded torus knot renders. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React 19 + R3F 9 project

Toolchain, tsconfig, Vitest with coverage thresholds scoped to pure
modules, and the frame-rate-independent damp helper every animation
in the site will use."
```

---

## Task 2: M0 spike — dev server over the Tailscale funnel, on the Quest

**Goal:** prove the load-bearing transport assumption before any of the design depends on it. `http://192.168.x.x:5173` is not a secure context, so `navigator.xr` is simply absent on the headset — which presents as a code bug and is not one.

**Files:**
- Create: `src/spike/Capabilities.tsx` (temporary; removed in Task 3)
- Modify: `src/app/App.tsx`
- Create: `docs/m0-spike-findings.md`

**Interfaces:**
- Consumes: the Task 1 scaffold.
- Produces: `docs/m0-spike-findings.md`, a recorded yes/no on WebXR reachability. Task 14 depends on the answer.

- [ ] **Step 1: Write the capability readout**

Create `src/spike/Capabilities.tsx`. This renders as DOM, not in the canvas, so it is readable in the Quest browser before entering a session:

```tsx
import { useEffect, useState } from 'react'

type Probe = { label: string; value: string }

export function Capabilities() {
  const [probes, setProbes] = useState<Probe[]>([])

  useEffect(() => {
    const results: Probe[] = [
      { label: 'isSecureContext', value: String(window.isSecureContext) },
      { label: 'location.origin', value: window.location.origin },
      { label: 'navigator.xr present', value: String('xr' in navigator) },
      { label: 'userAgent', value: navigator.userAgent },
    ]

    if (!('xr' in navigator)) {
      setProbes([...results, { label: 'immersive-vr', value: 'n/a — no navigator.xr' }])
      return
    }

    navigator.xr!
      .isSessionSupported('immersive-vr')
      .then((supported) => setProbes([...results, { label: 'immersive-vr', value: String(supported) }]))
      .catch((error: unknown) =>
        setProbes([...results, { label: 'immersive-vr', value: `threw: ${String(error)}` }]),
      )
  }, [])

  return (
    <div style={{ padding: 24, fontSize: 20, lineHeight: 1.6, fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 28 }}>M0 capability probe</h1>
      {probes.map((probe) => (
        <div key={probe.label}>
          <strong>{probe.label}:</strong> {probe.value}
        </div>
      ))}
    </div>
  )
}
```

Temporarily replace the body of `src/app/App.tsx` with:

```tsx
import { Capabilities } from '../spike/Capabilities'

export function App() {
  return <Capabilities />
}
```

- [ ] **Step 2: Confirm the readout locally**

Run: `npm run dev`, open `http://localhost:5173`.
Expected: `isSecureContext: true` (localhost is always a secure context) and `navigator.xr present: false` on a desktop browser with no headset runtime.

- [ ] **Step 3: Expose the dev server over the funnel**

With `npm run dev` still running, in a second shell:

```bash
tailscale funnel --bg 5173
tailscale funnel status
```

Expected: a public HTTPS URL on `snowple.tail709630.ts.net`.

If the page returns **"Blocked request. This host is not allowed"**, `allowedHosts` in `vite.config.ts` does not cover the hostname the funnel presents. Add the exact hostname from `tailscale funnel status` and restart the dev server.

- [ ] **Step 4: Load it on the Quest 2**

In the Quest Browser, open the funnel URL.

Expected and required:
- `isSecureContext: true`
- `location.origin` starts with `https://`
- `navigator.xr present: true`
- `immersive-vr: true`

If `navigator.xr` is absent over HTTPS, stop and diagnose before continuing — the entire XR half of the design rests on this.

- [ ] **Step 5: Close the funnel**

```bash
tailscale funnel --bg off
tailscale funnel status
```

Expected: no funnel listed. Leaving it on publishes the dev server to the internet.

- [ ] **Step 6: Record the findings**

Create `docs/m0-spike-findings.md`:

```markdown
# M0 Spike Findings

## Spike 1 — WebXR over the Tailscale funnel

**Question:** does a Vite dev server, exposed via `tailscale funnel`, present a
secure context that the Quest 2 Browser accepts for `immersive-vr`?

**Date:** <fill in>
**Device:** Meta Quest 2, Quest Browser <version from the userAgent readout>
**URL:** <funnel URL>

| Probe | Result |
|---|---|
| `isSecureContext` | |
| `navigator.xr` present | |
| `isSessionSupported('immersive-vr')` | |

**Verdict:**

**Notes / gotchas:**
- Vite `server.allowedHosts` must include the funnel hostname or requests 403.
- `tailscale funnel --bg off` after every session.

## Spike 2 — microphone inside an immersive-vr session

(completed in Task 3)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: M0 spike 1 — verify WebXR over Tailscale funnel on Quest 2

Temporary capability probe page plus recorded findings. Confirms the
secure-context transport the whole XR design assumes."
```

---

## Task 3: M0 spike — `getUserMedia` inside an `immersive-vr` session

**Goal:** the spec's `papercup` room is driven by live microphone input. Permission prompts are DOM UI, and a headset in an immersive session is not showing the DOM. If the mic cannot be acquired *inside* a session, the M3 room needs redesigning — better to know now.

**Files:**
- Modify: `src/spike/Capabilities.tsx`
- Modify: `docs/m0-spike-findings.md`
- Delete (at the end): `src/spike/Capabilities.tsx`
- Modify: `src/app/App.tsx` (restore)

**Interfaces:**
- Consumes: Task 2's funnel loop.
- Produces: a recorded verdict on mic-in-session, and the answer to *when* permission must be requested. `src/xr/store.ts` (Task 14) is unaffected either way; the M3 plan depends on this.

- [ ] **Step 1: Add a mic probe that runs inside a session**

Append to `src/spike/Capabilities.tsx` — a full R3F scene so the readout is legible *inside* the headset, where DOM is invisible:

```tsx
import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { createXRStore, XR } from '@react-three/xr'
import { useCallback, useRef, useState } from 'react'
import type { Mesh } from 'three'

const store = createXRStore()

function LevelBar({ analyser }: { analyser: AnalyserNode | null }) {
  const bar = useRef<Mesh>(null)
  const buffer = useRef(new Uint8Array(0))

  useFrame(() => {
    if (!analyser || !bar.current) return
    if (buffer.current.length !== analyser.frequencyBinCount) {
      buffer.current = new Uint8Array(analyser.frequencyBinCount)
    }
    analyser.getByteTimeDomainData(buffer.current)

    let peak = 0
    for (const sample of buffer.current) peak = Math.max(peak, Math.abs(sample - 128))
    bar.current.scale.y = 0.05 + (peak / 128) * 3
  })

  return (
    <mesh ref={bar} position={[0, 1.2, -2]}>
      <boxGeometry args={[0.1, 1, 0.1]} />
      <meshBasicMaterial color="#00ff88" />
    </mesh>
  )
}

export function MicSpike() {
  const [status, setStatus] = useState('idle — press Request mic')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const requestMic = useCallback(async () => {
    setStatus('requesting…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      await context.resume()
      const node = context.createAnalyser()
      node.fftSize = 2048
      context.createMediaStreamSource(stream).connect(node)
      setAnalyser(node)
      setStatus(`granted — audioContext.state=${context.state}`)
    } catch (error) {
      setStatus(`denied/failed: ${String(error)}`)
    }
  }, [])

  return (
    <>
      <div style={{ position: 'absolute', zIndex: 1, padding: 16 }}>
        <button style={{ fontSize: 22, padding: 12 }} onClick={() => store.enterVR()}>
          Enter VR
        </button>
        <button style={{ fontSize: 22, padding: 12, marginLeft: 12 }} onClick={requestMic}>
          Request mic
        </button>
      </div>
      <Canvas camera={{ position: [0, 1.6, 0] }}>
        <XR store={store}>
          <color attach="background" args={['#101014']} />
          <ambientLight intensity={1} />
          <Text position={[0, 1.7, -2]} fontSize={0.09} maxWidth={3} textAlign="center">
            {status}
          </Text>
          <LevelBar analyser={analyser} />
          <mesh
            position={[0.8, 1.2, -2]}
            onClick={() => void requestMic()}
            onPointerDown={() => void requestMic()}
          >
            <boxGeometry args={[0.4, 0.2, 0.05]} />
            <meshBasicMaterial color="#ff5577" />
          </mesh>
          <Text position={[0.8, 1.2, -1.96]} fontSize={0.05}>
            mic
          </Text>
        </XR>
      </Canvas>
    </>
  )
}
```

Point `App` at `MicSpike`.

The in-scene pink box matters: it is how you trigger `getUserMedia` from a controller *while already in the session*, which is the case that might fail.

- [ ] **Step 2: Run the three orderings on the Quest**

Bring the funnel up again (`npm run dev`, then `tailscale funnel --bg 5173`) and test each ordering, recording the status text and whether the green bar reacts to your voice:

1. **Grant first, then enter VR** — press "Request mic" in the DOM, allow, then "Enter VR".
2. **Enter VR first, then request** — enter the session, then select the pink box with a controller.
3. **Previously granted** — with the permission already remembered for the origin, enter VR and select the pink box.

Ordering 1 is the fallback if 2 fails: request the mic on the flat page before the user ever enters XR.

- [ ] **Step 3: Close the funnel**

```bash
tailscale funnel --bg off
```

- [ ] **Step 4: Record the findings**

Replace the Spike 2 stub in `docs/m0-spike-findings.md`:

```markdown
## Spike 2 — microphone inside an immersive-vr session

**Question:** can `getUserMedia({audio:true})` be acquired, and does an
`AudioContext` reach `running`, while an `immersive-vr` session is active on
Quest Browser?

**Date:** <fill in>

| Ordering | Permission result | AudioContext state | Bar reacts to voice |
|---|---|---|---|
| Grant in DOM, then enter VR | | | |
| Enter VR, then request in-session | | | |
| Permission pre-granted, request in-session | | | |

**Verdict:**

**Consequence for the M3 papercup room:**
- If in-session request works → request on first interaction inside the room.
- If it does not → request on the flat page before entering XR, and fall back to
  the synthesized waveform when the user never granted it.
```

- [ ] **Step 5: Remove the spike and restore the app**

```bash
git rm -r src/spike
```

Restore `src/app/App.tsx` to the Task 1 torus-knot placeholder.

The findings document is the deliverable. The spike code is not — it would rot.

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: M0 spike 2 — microphone inside immersive-vr on Quest 2

Records whether getUserMedia can be acquired in-session and which request
ordering works. Spike code removed; findings retained."
```

---

## Task 4: Content schema and project data

**Files:**
- Create: `src/content/schema.ts`
- Create: `src/content/projects.ts`
- Test: `tests/unit/content/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ProjectSchema`, `ProjectsSchema` (zod) and `type Project = { id: string; title: string; blurb: string; links: { label: string; href: string }[] }` from `src/content/schema.ts`
  - `parseProjects(input: unknown): Project[]` from `src/content/schema.ts`
  - `projects: Project[]` from `src/content/projects.ts`
  - Task 5's registry consumes `projects` and `Project`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/content/schema.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseProjects, ProjectSchema } from '../../../src/content/schema'
import { projects } from '../../../src/content/projects'

const valid = {
  id: 'papercup',
  title: 'papercup',
  blurb: 'A Discord voice bot that turns your homelab into a phone line you can talk to.',
  links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/papercup' }],
}

describe('ProjectSchema', () => {
  test('accepts a well-formed project', () => {
    expect(ProjectSchema.parse(valid)).toEqual(valid)
  })

  test('rejects an id that is not kebab-case', () => {
    expect(() => ProjectSchema.parse({ ...valid, id: 'Paper Cup' })).toThrow()
  })

  test('rejects a blurb that is too short to be informative', () => {
    expect(() => ProjectSchema.parse({ ...valid, blurb: 'a thing' })).toThrow()
  })

  test('rejects a blurb too long to fit an info panel', () => {
    expect(() => ProjectSchema.parse({ ...valid, blurb: 'x'.repeat(281) })).toThrow()
  })

  test('rejects a link href that is not an absolute URL', () => {
    expect(() =>
      ProjectSchema.parse({ ...valid, links: [{ label: 'Repo', href: '/relative' }] }),
    ).toThrow()
  })

  test('requires at least one link', () => {
    expect(() => ProjectSchema.parse({ ...valid, links: [] })).toThrow()
  })
})

describe('the real project data', () => {
  test('parses against the schema', () => {
    expect(() => parseProjects(projects)).not.toThrow()
  })

  test('contains exactly the five in-scope projects', () => {
    expect(projects.map((p) => p.id).sort()).toEqual(
      ['cli-p2p-boardgame', 'open-ski-data', 'papercup', 'project-beta', 'skiwatch'].sort(),
    )
  })

  test('has unique ids', () => {
    const ids = projects.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

The blurb bounds are not decoration: under 20 characters says nothing, over 280 overflows the info panel and forces a font-size fight later.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/content/schema.test.ts`
Expected: FAIL — cannot resolve `src/content/schema`.

- [ ] **Step 3: Write the schema**

Create `src/content/schema.ts`:

```ts
import { z } from 'zod'

export const LinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().url(),
})

export const ProjectSchema = z.object({
  /** Kebab-case; also the URL segment in /p/:id. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  /** Long enough to inform, short enough to fit one info panel. */
  blurb: z.string().min(20).max(280),
  links: z.array(LinkSchema).min(1),
})

export const ProjectsSchema = z.array(ProjectSchema).min(1)

export type Link = z.infer<typeof LinkSchema>
export type Project = z.infer<typeof ProjectSchema>

export function parseProjects(input: unknown): Project[] {
  return ProjectsSchema.parse(input)
}
```

If the installed zod is v4 and `z.string().url()` is deprecated in favour of `z.url()`, use `z.url()` — the tests are the contract, not the spelling.

- [ ] **Step 4: Write the project data**

Create `src/content/projects.ts`. Blurbs are drawn from each repo's own README:

```ts
import type { Project } from './schema'

/**
 * Copy, links and metadata only — no components. The registry in
 * ./registry.tsx binds these values to preview and scene components, so
 * editing a blurb never touches a component file.
 */
export const projects: Project[] = [
  {
    id: 'papercup',
    title: 'papercup',
    blurb:
      'A voice line to Claude Code running on your own homelab. Discord bot: press /pickup, talk like a phone call, get spoken answers. Fully local voice stack — no audio leaves your network.',
    links: [
      { label: 'Repo', href: 'https://github.com/powder-nomad/papercup' },
      { label: 'Docs', href: 'https://powder-nomad.github.io/papercup/' },
    ],
  },
  {
    id: 'skiwatch',
    title: 'SkiWatch',
    blurb:
      'Every Korean ski resort webcam on one page, plus just enough weather to decide whether to go. Anonymous and static by design — no accounts, no server-side user state.',
    links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/SkiWatch' }],
  },
  {
    id: 'open-ski-data',
    title: 'open-ski-data',
    blurb:
      'An open registry of ski resort geometry — places, slopes, lifts, webcams, and the graph connecting them. Contributors edit through a web editor that opens pull requests against the canonical repo.',
    links: [
      { label: 'Repo', href: 'https://github.com/powder-nomad/open-ski-data' },
      { label: 'Editor', href: 'https://osd-edit.pages.dev' },
    ],
  },
  {
    id: 'project-beta',
    title: 'project-beta',
    blurb:
      'Bouldering movement analysis: a video-to-analysis pipeline that measures climbing speed and stability and picks out the crux points of a route.',
    links: [{ label: 'Repo', href: 'https://github.com/powder-nomad/project-beta' }],
  },
  {
    id: 'cli-p2p-boardgame',
    title: 'CLI P2P Board Game Hub',
    blurb:
      'Eleven board games played peer-to-peer entirely in the terminal. UDP beacons find opponents on the LAN with zero configuration, and three clients — Python, Node and Bun — share one wire protocol.',
    links: [{ label: 'Repo', href: 'https://github.com/paulkim-xr/cli-p2p-boardgame' }],
  },
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/content/schema.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: project content schema and data

Zod-validated project metadata for the five in-scope projects. Blurb
bounds are enforced so copy cannot silently overflow an info panel."
```

---

## Task 5: The Room registry

**Files:**
- Create: `src/content/registry.tsx`
- Create: `src/exhibit/Exhibit.tsx` (minimal placeholder; fleshed out in Task 12)
- Create: `src/hub/previews/` — five placeholder preview components
- Test: `tests/unit/content/registry.test.ts`

**Interfaces:**
- Consumes: `projects`, `Project` from Task 4.
- Produces, from `src/content/registry.tsx`:
  - `type RoomScene = ComponentType<{ room: Room }>`
  - `type LazyScene = LazyExoticComponent<RoomScene> & { preload: () => Promise<unknown> }`
  - `type Room = Project & { preview: ComponentType<{ selected: boolean }>; scene: LazyScene }`
  - `const rooms: Room[]`
  - `function getRoom(id: string): Room | undefined`
  - `function roomIndex(id: string): number` — returns `-1` when unknown
- Tasks 7, 9, 11, 12 all consume `Room`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/content/registry.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { getRoom, roomIndex, rooms } from '../../../src/content/registry'
import { projects } from '../../../src/content/projects'

describe('room registry', () => {
  test('produces one room per project', () => {
    expect(rooms).toHaveLength(projects.length)
  })

  test('every room carries a preview component', () => {
    for (const room of rooms) {
      expect(typeof room.preview, `${room.id} preview`).toBe('function')
    }
  })

  test('every room carries a lazy scene with a preload hook', () => {
    for (const room of rooms) {
      expect(room.scene, `${room.id} scene`).toBeTruthy()
      expect(typeof room.scene.preload, `${room.id} preload`).toBe('function')
    }
  })

  test('preload resolves to a module with a default export', async () => {
    for (const room of rooms) {
      const loaded = (await room.scene.preload()) as { default?: unknown }
      expect(typeof loaded.default, `${room.id} default export`).toBe('function')
    }
  })

  test('getRoom finds a room by id', () => {
    expect(getRoom('papercup')?.title).toBe('papercup')
  })

  test('getRoom returns undefined for an unknown id', () => {
    expect(getRoom('does-not-exist')).toBeUndefined()
  })

  test('roomIndex returns -1 for an unknown id', () => {
    expect(roomIndex('does-not-exist')).toBe(-1)
  })

  test('roomIndex agrees with the rooms array order', () => {
    rooms.forEach((room, index) => expect(roomIndex(room.id)).toBe(index))
  })
})
```

The `preload` test is the one that catches a real class of bug: a typo'd dynamic import path fails silently at runtime, only when a user selects that project.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/content/registry.test.ts`
Expected: FAIL — cannot resolve `src/content/registry`.

- [ ] **Step 3: Write the five placeholder previews**

Each is a distinct primitive so the carousel is legible before real art exists. Create `src/hub/previews/PapercupPreview.tsx`:

```tsx
export function PapercupPreview({ selected }: { selected: boolean }) {
  return (
    <mesh>
      <cylinderGeometry args={[0.45, 0.28, 0.7, 24, 1, true]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#9aa4b2'} roughness={0.6} side={2} />
    </mesh>
  )
}
```

`src/hub/previews/SkiWatchPreview.tsx`:

```tsx
export function SkiWatchPreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0, 0, Math.PI]}>
      <coneGeometry args={[0.5, 0.8, 4]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#7fb8ff'} roughness={0.5} />
    </mesh>
  )
}
```

`src/hub/previews/OpenSkiDataPreview.tsx`:

```tsx
export function OpenSkiDataPreview({ selected }: { selected: boolean }) {
  return (
    <mesh>
      <icosahedronGeometry args={[0.5, 1]} />
      <meshStandardMaterial
        color={selected ? '#ffffff' : '#8ce0c0'}
        wireframe
      />
    </mesh>
  )
}
```

`src/hub/previews/ProjectBetaPreview.tsx`:

```tsx
export function ProjectBetaPreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <dodecahedronGeometry args={[0.5]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#ffb27f'} flatShading roughness={0.7} />
    </mesh>
  )
}
```

`src/hub/previews/BoardgamePreview.tsx`:

```tsx
export function BoardgamePreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0.3, 0.3, 0]}>
      <boxGeometry args={[0.7, 0.12, 0.7]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#c79aff'} roughness={0.4} />
    </mesh>
  )
}
```

- [ ] **Step 4: Write a minimal exhibit so the lazy import resolves**

Create `src/exhibit/Exhibit.tsx`. Task 12 replaces the body; the **default export and props signature are fixed now** because the registry and the tests depend on them:

```tsx
import type { Room } from '../content/registry'

export default function Exhibit({ room }: { room: Room }) {
  return (
    <group>
      <mesh position={[0, 1, -2]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh visible={false} name={`exhibit-${room.id}`} />
    </group>
  )
}
```

- [ ] **Step 5: Write the registry**

Create `src/content/registry.tsx`:

```tsx
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { projects } from './projects'
import type { Project } from './schema'
import { PapercupPreview } from '../hub/previews/PapercupPreview'
import { SkiWatchPreview } from '../hub/previews/SkiWatchPreview'
import { OpenSkiDataPreview } from '../hub/previews/OpenSkiDataPreview'
import { ProjectBetaPreview } from '../hub/previews/ProjectBetaPreview'
import { BoardgamePreview } from '../hub/previews/BoardgamePreview'

export type RoomScene = ComponentType<{ room: Room }>

/** A lazy scene that can also be told to start downloading early. */
export type LazyScene = LazyExoticComponent<RoomScene> & {
  preload: () => Promise<unknown>
}

export type Room = Project & {
  /** Mounted by the carousel. Always resident, so keep it cheap. */
  preview: ComponentType<{ selected: boolean }>
  /** Mounted behind the void mask. Code-split — absent from the initial bundle. */
  scene: LazyScene
}

function lazyScene(factory: () => Promise<{ default: RoomScene }>): LazyScene {
  return Object.assign(lazy(factory), { preload: factory })
}

/**
 * The exhibit template is every project's floor. Graduating a project to a
 * bespoke room is a one-line change here:
 *
 *   scene: lazyScene(() => import('../rooms/papercup/StringRoom'))
 */
const exhibitScene = () => lazyScene(() => import('../exhibit/Exhibit'))

const bindings: Record<string, Pick<Room, 'preview' | 'scene'>> = {
  papercup: { preview: PapercupPreview, scene: exhibitScene() },
  skiwatch: { preview: SkiWatchPreview, scene: exhibitScene() },
  'open-ski-data': { preview: OpenSkiDataPreview, scene: exhibitScene() },
  'project-beta': { preview: ProjectBetaPreview, scene: exhibitScene() },
  'cli-p2p-boardgame': { preview: BoardgamePreview, scene: exhibitScene() },
}

export const rooms: Room[] = projects.map((project) => {
  const binding = bindings[project.id]
  if (!binding) {
    throw new Error(`No preview/scene binding registered for project "${project.id}"`)
  }
  return { ...project, ...binding }
})

const indexById = new Map(rooms.map((room, index) => [room.id, index]))

export function getRoom(id: string): Room | undefined {
  const index = indexById.get(id)
  return index === undefined ? undefined : rooms[index]
}

export function roomIndex(id: string): number {
  return indexById.get(id) ?? -1
}
```

The `throw` is deliberate: adding a project to `projects.ts` without a binding fails loudly at module load and in the test suite, rather than rendering an invisible hole in the carousel.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/content/`
Expected: PASS, all schema and registry tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: room registry binding project data to scenes

Every project resolves to a Room with a cheap always-resident preview and
a code-split scene. Graduating a project to a bespoke room is one import."
```

---

## Task 6: Carousel ring math

**Files:**
- Create: `src/hub/ring.ts`
- Test: `tests/unit/hub/ring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/hub/ring.ts`:
  - `angleStep(count: number): number`
  - `ringPositions(count: number, radius: number): [number, number, number][]`
  - `shortestDelta(from: number, to: number, count: number): number`
  - `targetRotation(currentRotation: number, index: number, count: number): number`
- Task 7 consumes all four.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hub/ring.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { angleStep, ringPositions, shortestDelta, targetRotation } from '../../../src/hub/ring'

describe('angleStep', () => {
  test('divides the circle evenly', () => {
    expect(angleStep(4)).toBeCloseTo(Math.PI / 2)
    expect(angleStep(5)).toBeCloseTo((Math.PI * 2) / 5)
  })

  test('returns zero for a degenerate ring', () => {
    expect(angleStep(0)).toBe(0)
    expect(angleStep(1)).toBe(0)
  })
})

describe('ringPositions', () => {
  test('returns one position per item', () => {
    expect(ringPositions(5, 3)).toHaveLength(5)
  })

  test('places item 0 nearest the camera on +Z', () => {
    const [first] = ringPositions(5, 3)
    expect(first[0]).toBeCloseTo(0)
    expect(first[1]).toBeCloseTo(0)
    expect(first[2]).toBeCloseTo(3)
  })

  test('keeps every item on the ring radius', () => {
    for (const [x, , z] of ringPositions(7, 2.5)) {
      expect(Math.hypot(x, z)).toBeCloseTo(2.5)
    }
  })

  test('places items in the XZ plane at y = 0', () => {
    for (const [, y] of ringPositions(5, 3)) expect(y).toBe(0)
  })
})

describe('shortestDelta', () => {
  test('is zero for the same index', () => {
    expect(shortestDelta(2, 2, 5)).toBe(0)
  })

  test('steps forward when that is shorter', () => {
    expect(shortestDelta(0, 1, 5)).toBe(1)
  })

  test('wraps backward rather than crossing the whole ring', () => {
    // 0 -> 4 of 5 is one step backwards, not four forwards.
    expect(shortestDelta(0, 4, 5)).toBe(-1)
  })

  test('wraps forward across the seam', () => {
    expect(shortestDelta(4, 0, 5)).toBe(1)
  })
})

describe('targetRotation', () => {
  test('does not unwind a full turn to reach a neighbour', () => {
    const step = angleStep(5)
    // Currently showing index 0. Selecting index 4 should rotate by one step,
    // not by four.
    const rotation = targetRotation(0, 4, 5)
    expect(Math.abs(rotation)).toBeCloseTo(step)
  })

  test('accumulates instead of snapping back across the seam', () => {
    const step = angleStep(5)
    const first = targetRotation(0, 1, 5)
    const second = targetRotation(first, 2, 5)
    expect(second - first).toBeCloseTo(step)
  })
})
```

`shortestDelta` and `targetRotation` exist for one reason: without them the carousel visibly spins the long way round whenever the selection crosses the seam between the last and first item. It is the single most common carousel bug.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/hub/ring.test.ts`
Expected: FAIL — cannot resolve `src/hub/ring`.

- [ ] **Step 3: Write the implementation**

Create `src/hub/ring.ts`:

```ts
const TAU = Math.PI * 2

/** Angular spacing between neighbouring items. Zero for a ring of 0 or 1. */
export function angleStep(count: number): number {
  return count > 1 ? TAU / count : 0
}

/**
 * Item positions on a ring in the XZ plane, item 0 at +Z (nearest a camera
 * looking down -Z) and subsequent items proceeding counter-clockwise.
 */
export function ringPositions(count: number, radius: number): [number, number, number][] {
  const step = angleStep(count)
  return Array.from({ length: count }, (_, index) => {
    const angle = step * index
    return [Math.sin(angle) * radius, 0, Math.cos(angle) * radius]
  })
}

/**
 * Signed number of steps from `from` to `to` taking the shorter way round.
 * Ties (exactly half a ring) resolve forwards.
 */
export function shortestDelta(from: number, to: number, count: number): number {
  if (count <= 1) return 0
  const raw = ((to - from) % count + count) % count
  return raw > count / 2 ? raw - count : raw
}

/**
 * The absolute rotation the ring should ease toward so that `index` faces the
 * camera, expressed relative to the *current* rotation so the ring never
 * unwinds. Pass the value this returned last time as `currentRotation`.
 */
export function targetRotation(currentRotation: number, index: number, count: number): number {
  const step = angleStep(count)
  if (step === 0) return currentRotation

  // Which index the ring is currently showing, derived from its rotation.
  const currentIndex = Math.round(-currentRotation / step)
  const delta = shortestDelta(((currentIndex % count) + count) % count, index, count)
  return currentRotation - delta * step
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/hub/ring.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: carousel ring math

Ring positions plus shortest-path rotation so selection never spins the
long way round the seam."
```

---

## Task 7: The carousel

**Files:**
- Create: `src/hub/Carousel3D.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `rooms`, `Room` (Task 5); `ringPositions`, `targetRotation` (Task 6); `damp` (Task 1).
- Produces:
  ```tsx
  type Carousel3DProps = {
    rooms: Room[]
    activeIndex: number
    onStep: (delta: number) => void
    onSelect: (id: string) => void
    dimmed: boolean
  }
  export function Carousel3D(props: Carousel3DProps): JSX.Element
  ```
  Task 11 renders this.

- [ ] **Step 1: Write the carousel**

Create `src/hub/Carousel3D.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { Group } from 'three'
import type { Room } from '../content/registry'
import { damp } from '../lib/damp'
import { ringPositions, targetRotation } from './ring'

const RADIUS = 3
const SPIN_LAMBDA = 6
/** Horizontal pointer travel, in pixels, that counts as one carousel step. */
const DRAG_STEP_PX = 110

type Carousel3DProps = {
  rooms: Room[]
  activeIndex: number
  onStep: (delta: number) => void
  onSelect: (id: string) => void
  /** True once a transition has begun — the ring stops accepting input. */
  dimmed: boolean
}

/**
 * Pointer-drag stepping, bound at the window rather than to the ring geometry
 * so a drag that starts on empty space still works. The spec's parity table
 * lists "scroll / drag" for the flat carousel; this is the drag half.
 */
function useDragStep(onStep: (delta: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let originX: number | null = null

    const down = (event: PointerEvent) => {
      originX = event.clientX
    }
    const move = (event: PointerEvent) => {
      if (originX === null) return
      const travel = event.clientX - originX
      if (Math.abs(travel) < DRAG_STEP_PX) return
      onStep(-Math.sign(travel)) // drag right reveals the item to the left
      originX = event.clientX
    }
    const up = () => {
      originX = null
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [onStep, enabled])
}

export function Carousel3D({ rooms, activeIndex, onStep, onSelect, dimmed }: Carousel3DProps) {
  const ring = useRef<Group>(null)
  const rotation = useRef(0)
  const positions = useMemo(() => ringPositions(rooms.length, RADIUS), [rooms.length])

  useDragStep(onStep, !dimmed)

  useFrame((_state, delta) => {
    if (!ring.current) return
    const goal = targetRotation(rotation.current, activeIndex, rooms.length)
    rotation.current = damp(rotation.current, goal, SPIN_LAMBDA, delta)
    ring.current.rotation.y = rotation.current
  })

  return (
    <group
      ref={ring}
      // Flat: wheel and drag step the ring. Task 11 also binds arrow keys, and
      // Task 14 binds the XR thumbstick — all three call the same onStep.
      onWheel={(event) => {
        if (dimmed) return
        event.stopPropagation()
        onStep(Math.sign(event.deltaY))
      }}
    >
      {rooms.map((room, index) => {
        const Preview = room.preview
        const selected = index === activeIndex
        return (
          <group
            key={room.id}
            position={positions[index]}
            onClick={(event) => {
              event.stopPropagation()
              if (dimmed) return
              if (selected) onSelect(room.id)
              else onStep(index - activeIndex)
            }}
            onPointerOver={(event) => event.stopPropagation()}
          >
            <ItemFacing rotationRef={rotation}>
              <Preview selected={selected} />
            </ItemFacing>
          </group>
        )
      })}
    </group>
  )
}

/**
 * Counter-rotates a ring item so it always faces the viewer regardless of where
 * the ring has spun to. Cheaper and steadier than a per-frame lookAt.
 */
function ItemFacing({
  rotationRef,
  children,
}: {
  rotationRef: RefObject<number>
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.rotation.y = -rotationRef.current
  })
  return <group ref={group}>{children}</group>
}

export { RADIUS }
```

- [ ] **Step 2: Render it from App with local state**

Replace `src/app/App.tsx` (routing arrives in Task 11):

```tsx
import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import { Carousel3D } from '../hub/Carousel3D'
import { rooms } from '../content/registry'

export function App() {
  const [activeIndex, setActiveIndex] = useState(0)

  const step = (delta: number) =>
    setActiveIndex((current) => ((current + delta) % rooms.length + rooms.length) % rooms.length)

  return (
    <Canvas camera={{ position: [0, 0.6, 7], fov: 50 }}>
      <color attach="background" args={['#08080c']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} />
      <Carousel3D
        rooms={rooms}
        activeIndex={activeIndex}
        onStep={step}
        onSelect={(id) => console.info('select', id)}
        dimmed={false}
      />
    </Canvas>
  )
}
```

- [ ] **Step 3: Verify by hand**

Run: `npm run dev`, open `http://localhost:5173`.

Expected:
- Five distinct primitives arranged on a ring, the front one white.
- Scrolling the wheel steps the ring one item at a time, easing rather than snapping.
- Dragging horizontally steps the ring, including when the drag starts on empty background.
- Stepping from the first item backwards rotates **one** step, not four — this is Task 6's `targetRotation` doing its job. If the ring unwinds the long way, the bug is there, not here.
- Clicking a non-front item brings it to the front; clicking the front item logs `select <id>` in the console.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 3D project carousel

Ring of project previews with eased shortest-path rotation, wheel and
click stepping, and a dimmed state for when a transition takes over."
```

---

## Task 8: The transition reducer

This is the site's spine, and it is pure — so it is the most heavily tested module in the codebase.

**Files:**
- Create: `src/transition/machine.ts`
- Test: `tests/unit/transition/machine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/transition/machine.ts`:
  - `type Phase = 'browsing' | 'focusing' | 'masking' | 'swapping' | 'revealing' | 'inRoom'`
  - `type Direction = 'in' | 'out'`
  - `type TransitionState = { phase: Phase; target: string | null; direction: Direction; maskComplete: boolean; sceneReady: boolean }`
  - `type TransitionEvent` (tagged union, listed below)
  - `const initialState: TransitionState`
  - `const browsingIn: (target: string) => TransitionState` — the state to start from on a deep link
  - `function reduce(state: TransitionState, event: TransitionEvent): TransitionState`
  - `function isLocked(state: TransitionState): boolean`
  - `function shouldMountScene(state: TransitionState): boolean`
- Task 9 consumes all of these.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/transition/machine.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  initialState,
  isLocked,
  reduce,
  shouldMountScene,
  type TransitionEvent,
  type TransitionState,
} from '../../../src/transition/machine'

const run = (state: TransitionState, ...events: TransitionEvent[]): TransitionState =>
  events.reduce(reduce, state)

describe('entering a room', () => {
  test('starts in browsing with nothing targeted', () => {
    expect(initialState.phase).toBe('browsing')
    expect(initialState.target).toBeNull()
  })

  test('SELECT begins focusing on the chosen room', () => {
    const state = reduce(initialState, { type: 'SELECT', id: 'papercup' })
    expect(state.phase).toBe('focusing')
    expect(state.target).toBe('papercup')
    expect(state.direction).toBe('in')
  })

  test('runs the full sequence to inRoom', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
      { type: 'SCENE_READY' },
      { type: 'REVEAL_COMPLETE' },
    )
    expect(state.phase).toBe('inRoom')
    expect(state.target).toBe('papercup')
  })
})

describe('invariant: the mask holds until both the animation and the scene are ready', () => {
  test('MASK_COMPLETE alone does not reveal', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
    )
    expect(state.phase).toBe('swapping')
  })

  test('SCENE_READY alone does not reveal', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'SCENE_READY' },
    )
    expect(state.phase).toBe('masking')
  })

  test('a scene that resolves early still waits for the animation beat', () => {
    let state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SCENE_READY' }, // cached module: resolves during focusing
      { type: 'FOCUS_COMPLETE' },
    )
    expect(state.phase).toBe('masking')
    state = reduce(state, { type: 'MASK_COMPLETE' })
    expect(state.phase).toBe('revealing')
  })

  test('a slow scene simply holds the mask longer', () => {
    let state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
    )
    expect(state.phase).toBe('swapping')
    state = reduce(state, { type: 'SCENE_READY' })
    expect(state.phase).toBe('revealing')
  })
})

describe('invariant: non-interruptible past masking', () => {
  test('SELECT during focusing retargets', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SELECT', id: 'skiwatch' },
    )
    expect(state.phase).toBe('focusing')
    expect(state.target).toBe('skiwatch')
  })

  test('retargeting clears a scene-ready flag from the abandoned room', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SCENE_READY' },
      { type: 'SELECT', id: 'skiwatch' },
    )
    expect(state.sceneReady).toBe(false)
  })

  test('a double SELECT of the same id is idempotent', () => {
    const once = reduce(initialState, { type: 'SELECT', id: 'papercup' })
    const twice = reduce(once, { type: 'SELECT', id: 'papercup' })
    expect(twice).toEqual(once)
  })

  test.each(['masking', 'swapping', 'revealing'] as const)(
    'SELECT is ignored during %s',
    (phase) => {
      const locked: TransitionState = {
        phase,
        target: 'papercup',
        direction: 'in',
        maskComplete: phase !== 'masking',
        sceneReady: phase === 'revealing',
      }
      expect(reduce(locked, { type: 'SELECT', id: 'skiwatch' })).toEqual(locked)
    },
  )

  test('EXIT is ignored while entering', () => {
    const state = run(initialState, { type: 'SELECT', id: 'papercup' }, { type: 'FOCUS_COMPLETE' })
    expect(reduce(state, { type: 'EXIT' })).toEqual(state)
  })

  test('isLocked reports the non-interruptible phases', () => {
    expect(isLocked({ ...initialState, phase: 'browsing' })).toBe(false)
    expect(isLocked({ ...initialState, phase: 'focusing' })).toBe(false)
    expect(isLocked({ ...initialState, phase: 'masking' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'swapping' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'revealing' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'inRoom' })).toBe(false)
  })
})

describe('leaving a room', () => {
  const inRoom: TransitionState = {
    phase: 'inRoom',
    target: 'papercup',
    direction: 'in',
    maskComplete: false,
    sceneReady: true,
  }

  test('EXIT masks outward without a focusing beat', () => {
    const state = reduce(inRoom, { type: 'EXIT' })
    expect(state.phase).toBe('masking')
    expect(state.direction).toBe('out')
  })

  test('the hub needs no load, so masking out reveals immediately', () => {
    const state = run(inRoom, { type: 'EXIT' }, { type: 'MASK_COMPLETE' })
    expect(state.phase).toBe('revealing')
  })

  test('returns to browsing with no target', () => {
    const state = run(
      inRoom,
      { type: 'EXIT' },
      { type: 'MASK_COMPLETE' },
      { type: 'REVEAL_COMPLETE' },
    )
    expect(state.phase).toBe('browsing')
    expect(state.target).toBeNull()
  })
})

describe('shouldMountScene', () => {
  test('does not mount while browsing', () => {
    expect(shouldMountScene(initialState)).toBe(false)
  })

  test('mounts from focusing onward so the download starts early', () => {
    for (const phase of ['focusing', 'masking', 'swapping', 'revealing', 'inRoom'] as const) {
      expect(shouldMountScene({ ...initialState, phase, target: 'papercup' })).toBe(true)
    }
  })

  test('unmounts once the exit reveal has begun', () => {
    expect(
      shouldMountScene({
        phase: 'revealing',
        target: 'papercup',
        direction: 'out',
        maskComplete: true,
        sceneReady: true,
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/transition/machine.test.ts`
Expected: FAIL — cannot resolve `src/transition/machine`.

- [ ] **Step 3: Write the reducer**

Create `src/transition/machine.ts`:

```ts
export type Phase = 'browsing' | 'focusing' | 'masking' | 'swapping' | 'revealing' | 'inRoom'
export type Direction = 'in' | 'out'

export type TransitionState = {
  phase: Phase
  /** The room being entered, occupied, or left. Null only while browsing. */
  target: string | null
  direction: Direction
  /** The mask animation has finished covering the view. */
  maskComplete: boolean
  /** The lazy scene module has resolved and mounted. */
  sceneReady: boolean
}

export type TransitionEvent =
  | { type: 'SELECT'; id: string }
  | { type: 'FOCUS_COMPLETE' }
  | { type: 'MASK_COMPLETE' }
  | { type: 'SCENE_READY' }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'EXIT' }

export const initialState: TransitionState = {
  phase: 'browsing',
  target: null,
  direction: 'in',
  maskComplete: false,
  sceneReady: false,
}

/** Starting state for a direct landing on /p/:id — masked, awaiting the scene. */
export const browsingIn = (target: string): TransitionState => ({
  phase: 'masking',
  target,
  direction: 'in',
  maskComplete: false,
  sceneReady: false,
})

const LOCKED_PHASES: readonly Phase[] = ['masking', 'swapping', 'revealing']

/** True while user input must be ignored, so a double-select cannot double-load. */
export function isLocked(state: TransitionState): boolean {
  return LOCKED_PHASES.includes(state.phase)
}

/**
 * Whether the target room's lazy scene should be mounted. It mounts from
 * `focusing` so the download overlaps the animation, and unmounts as soon as
 * the outward reveal starts and the hub is what the viewer will see.
 */
export function shouldMountScene(state: TransitionState): boolean {
  if (state.target === null) return false
  if (state.phase === 'browsing') return false
  if (state.direction === 'out' && state.phase === 'revealing') return false
  return true
}

/** Both gates open — the mask may lift. */
function readyToReveal(state: TransitionState): boolean {
  // Leaving a room reveals the hub, which is eager and always resident.
  const sceneGate = state.direction === 'out' ? true : state.sceneReady
  return state.maskComplete && sceneGate
}

/** Advance out of `swapping` only when both gates are open. */
function settle(state: TransitionState): TransitionState {
  if (state.phase !== 'swapping') return state
  return readyToReveal(state) ? { ...state, phase: 'revealing' } : state
}

export function reduce(state: TransitionState, event: TransitionEvent): TransitionState {
  switch (event.type) {
    case 'SELECT': {
      if (isLocked(state)) return state
      if (state.phase === 'inRoom') return state
      if (state.phase === 'focusing' && state.target === event.id) return state
      return {
        phase: 'focusing',
        target: event.id,
        direction: 'in',
        maskComplete: false,
        // A retarget abandons whatever the previous room had loaded.
        sceneReady: false,
      }
    }

    case 'FOCUS_COMPLETE': {
      if (state.phase !== 'focusing') return state
      return { ...state, phase: 'masking' }
    }

    case 'MASK_COMPLETE': {
      if (state.phase !== 'masking') return state
      return settle({ ...state, phase: 'swapping', maskComplete: true })
    }

    case 'SCENE_READY': {
      if (state.phase === 'browsing') return state
      return settle({ ...state, sceneReady: true })
    }

    case 'REVEAL_COMPLETE': {
      if (state.phase !== 'revealing') return state
      if (state.direction === 'out') return initialState
      return { ...state, phase: 'inRoom' }
    }

    case 'EXIT': {
      if (state.phase !== 'inRoom') return state
      return { ...state, phase: 'masking', direction: 'out', maskComplete: false }
    }
  }
}
```

Note `settle` is applied to both `MASK_COMPLETE` and `SCENE_READY`: whichever arrives second is the one that opens the gate, and neither branch needs to know which it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/transition/machine.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Check coverage of the pure modules**

Run: `npm run coverage`
Expected: every included file at or above 80% on all four metrics.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: transition state machine

Pure reducer for browsing -> focusing -> masking -> swapping -> revealing
-> inRoom. Enforces both invariants: non-interruptible past masking, and
the mask holds until the animation and the lazy scene are both ready."
```

---

## Task 9: The void mask and the scene gate

**Files:**
- Create: `src/transition/useTransition.ts`
- Create: `src/transition/SceneGate.tsx`
- Create: `src/transition/VoidMask.tsx`

**Interfaces:**
- Consumes: everything from Task 8; `damp` (Task 1).
- Produces:
  - `useTransition(initial?: TransitionState)` returning
    `{ state: TransitionState; select(id: string): void; exit(): void; focusComplete(): void; maskComplete(): void; sceneReady(): void; revealComplete(): void }`
  - `<SceneGate onReady={() => void}>{children}</SceneGate>`
  - `<VoidMask phase={Phase} direction={Direction} mode={'flat' | 'xr'} onMaskComplete={() => void} onRevealComplete={() => void} />`
- Task 11 wires all three.

- [ ] **Step 1: Write the hook**

Create `src/transition/useTransition.ts`:

```ts
import { useCallback, useMemo, useReducer } from 'react'
import { initialState, reduce, type TransitionState } from './machine'

export function useTransition(initial: TransitionState = initialState) {
  const [state, dispatch] = useReducer(reduce, initial)

  const actions = useMemo(
    () => ({
      select: (id: string) => dispatch({ type: 'SELECT', id }),
      exit: () => dispatch({ type: 'EXIT' }),
      focusComplete: () => dispatch({ type: 'FOCUS_COMPLETE' }),
      maskComplete: () => dispatch({ type: 'MASK_COMPLETE' }),
      sceneReady: () => dispatch({ type: 'SCENE_READY' }),
      revealComplete: () => dispatch({ type: 'REVEAL_COMPLETE' }),
    }),
    [],
  )

  return useMemo(() => ({ state, ...actions }), [state, actions])
}

export type Transition = ReturnType<typeof useTransition>
```

Dispatch identity is stable, so `actions` never changes and no consumer re-renders because a callback moved.

- [ ] **Step 2: Write the scene gate**

Create `src/transition/SceneGate.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react'

/**
 * Reports that a lazy scene has resolved. React suspends the whole subtree
 * until the dynamic import settles, so this component mounting *is* the
 * readiness signal — no promise plumbing required.
 */
export function SceneGate({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady()
  }, [onReady])

  return <>{children}</>
}
```

- [ ] **Step 3: Write the void mask**

Create `src/transition/VoidMask.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide, FrontSide, type Mesh, type MeshBasicMaterial } from 'three'
import { damp } from '../lib/damp'
import type { Direction, Phase } from './machine'

const MASK_LAMBDA = 5
/** Below this the mask is treated as fully open; above it, fully closed. */
const EPSILON = 0.01
const XR_SPHERE_RADIUS = 8

type VoidMaskProps = {
  phase: Phase
  direction: Direction
  /** Flat scales a plane to fill the frustum; XR closes a sphere around the rig. */
  mode: 'flat' | 'xr'
  onMaskComplete: () => void
  onRevealComplete: () => void
}

/** How opaque the void should be in each phase. */
function coverageFor(phase: Phase, direction: Direction): number {
  switch (phase) {
    case 'browsing':
      return 0
    case 'focusing':
      return direction === 'in' ? 0.35 : 0
    case 'masking':
      return 1
    case 'swapping':
      return 1
    case 'revealing':
      return 0
    case 'inRoom':
      return 0
  }
}

export function VoidMask({
  phase,
  direction,
  mode,
  onMaskComplete,
  onRevealComplete,
}: VoidMaskProps) {
  const mesh = useRef<Mesh>(null)
  const coverage = useRef(0)
  const camera = useThree((state) => state.camera)

  useFrame((_state, delta) => {
    if (!mesh.current) return

    const goal = coverageFor(phase, direction)
    coverage.current = damp(coverage.current, goal, MASK_LAMBDA, delta)

    const material = mesh.current.material as MeshBasicMaterial
    material.opacity = coverage.current
    mesh.current.visible = coverage.current > EPSILON

    if (mode === 'xr') {
      // A world-scaled plane cannot fill a headset's view without clipping
      // through the viewer's face. An inverted sphere parented to the camera
      // closes in from all sides instead — the standard comfortable fade.
      mesh.current.position.copy(camera.position)
      const scale = 1 - coverage.current * 0.98
      mesh.current.scale.setScalar(Math.max(scale, 0.02))
    } else {
      mesh.current.position.copy(camera.position)
      mesh.current.translateZ(-0.5)
      mesh.current.quaternion.copy(camera.quaternion)
    }

    if (phase === 'masking' && coverage.current > 1 - EPSILON) onMaskComplete()
    if (phase === 'revealing' && coverage.current < EPSILON) onRevealComplete()
  })

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false} visible={false}>
      {mode === 'xr' ? (
        <sphereGeometry args={[XR_SPHERE_RADIUS, 24, 16]} />
      ) : (
        <planeGeometry args={[100, 100]} />
      )}
      {/* Shadeless and solid: the void is a surface, not a lit object. */}
      <meshBasicMaterial
        color="#0b0b10"
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        side={mode === 'xr' ? BackSide : FrontSide}
        fog={false}
      />
    </mesh>
  )
}
```

Two details that are load-bearing:
- `depthTest={false}` with `renderOrder={999}` guarantees the mask draws over everything regardless of where it sits in the scene graph.
- `onMaskComplete` / `onRevealComplete` fire every frame once the threshold is crossed. That is safe *because* the reducer ignores `MASK_COMPLETE` outside `masking` and `REVEAL_COMPLETE` outside `revealing` — the machine, not the component, enforces once-only.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: void mask and scene gate

Flat plane and XR inverted-sphere renderings of the same transition
phase, plus the Suspense-mount readiness signal."
```

---

## Task 10: Self-hosted display font

Troika, which powers drei's `<Text>`, fetches a default font from a CDN when none is supplied. A strict-CSP or offline load then renders nothing, and on a Quest it costs a round trip before any label appears.

**Files:**
- Create: `public/fonts/display.ttf`
- Create: `src/lib/font.ts`
- Test: `tests/unit/lib/font.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DISPLAY_FONT: string` from `src/lib/font.ts`. Every `<Text>` in Tasks 12 and 14 passes `font={DISPLAY_FONT}`.

- [ ] **Step 1: Obtain a static TTF**

Download a **static** (not variable) TTF of a legible sans — Inter and Roboto are both fine — and save it as `public/fonts/display.ttf`.

Verify it is not a variable font:

```bash
ls -la public/fonts/display.ttf
python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('public/fonts/display.ttf')
print('variable' if 'fvar' in f else 'static ok')
" 2>/dev/null || echo 'fontTools not installed — check the download page instead'
```

Troika renders a variable font only at its default instance, so weights would silently not apply.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/lib/font.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DISPLAY_FONT } from '../../../src/lib/font'

describe('display font', () => {
  test('is an absolute root-relative URL', () => {
    expect(DISPLAY_FONT.startsWith('/')).toBe(true)
  })

  test('the file actually exists in public/', () => {
    expect(existsSync(`public${DISPLAY_FONT}`)).toBe(true)
  })
})
```

This test exists because a missing font file is invisible in dev — troika falls back to the CDN and the text still renders. It only breaks in production.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/lib/font.test.ts`
Expected: FAIL — cannot resolve `src/lib/font`.

- [ ] **Step 4: Write the module**

Create `src/lib/font.ts`:

```ts
/**
 * Self-hosted so troika never reaches for its CDN default. Root-relative
 * because this is a user-scoped Pages site with no base path.
 */
export const DISPLAY_FONT = '/fonts/display.ttf'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/lib/font.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: self-host the display font

Troika falls back to a CDN font when none is given, which works in dev
and fails in production. A test asserts the file is really there."
```

---

## Task 11: Routing and the assembled shell

The task where everything meets. It also settles the single most important structural rule in an R3F app.

**Files:**
- Rewrite: `src/app/App.tsx`
- Create: `src/app/Stage.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Carousel3D` (7), `useTransition`/`VoidMask`/`SceneGate` (9), `rooms`/`getRoom`/`roomIndex` (5), `browsingIn`/`shouldMountScene`/`isLocked` (8).
- Produces:
  ```tsx
  type StageProps = {
    activeIndex: number
    transition: Transition
    onStep: (delta: number) => void
    xrMode: boolean
  }
  export function Stage(props: StageProps): JSX.Element
  ```
  Task 14 adds `xrMode` handling inside `Stage`.

- [ ] **Step 1: Write the stage — everything inside the Canvas**

**The rule:** `<Canvas>` mounts a separate React reconciler root. React context from the DOM tree — including react-router's — does **not** cross that boundary. Never call `useParams`, `useNavigate`, or any router hook inside a component rendered under `<Canvas>`. Read router state in `App`, pass it down as plain props.

Create `src/app/Stage.tsx`:

```tsx
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import { getRoom, rooms } from '../content/registry'
import { Carousel3D } from '../hub/Carousel3D'
import { SceneGate } from '../transition/SceneGate'
import { VoidMask } from '../transition/VoidMask'
import { isLocked, shouldMountScene } from '../transition/machine'
import type { Transition } from '../transition/useTransition'

type StageProps = {
  activeIndex: number
  transition: Transition
  onStep: (delta: number) => void
  xrMode: boolean
}

export function Stage({ activeIndex, transition, onStep, xrMode }: StageProps) {
  const { state } = transition
  const room = state.target ? getRoom(state.target) : undefined
  const showHub = state.phase !== 'inRoom'
  const Scene = room?.scene

  return (
    <>
      <color attach="background" args={['#08080c']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow={false} />

      {showHub && (
        <Carousel3D
          rooms={rooms}
          activeIndex={activeIndex}
          onStep={onStep}
          onSelect={transition.select}
          dimmed={isLocked(state)}
        />
      )}

      {/* Flat room navigation is orbit, per the spec's parity table. It exists
          only inside a room — orbiting the hub would fight the carousel — and
          never in XR, where the headset owns the camera. */}
      {!xrMode && state.phase === 'inRoom' && (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2}
          target={[0, 0.2, -1.6]}
        />
      )}

      {Scene && room && shouldMountScene(state) && (
        <Suspense fallback={null}>
          <SceneGate onReady={transition.sceneReady}>
            <Scene room={room} />
          </SceneGate>
        </Suspense>
      )}

      <VoidMask
        phase={state.phase}
        direction={state.direction}
        mode={xrMode ? 'xr' : 'flat'}
        onMaskComplete={transition.maskComplete}
        onRevealComplete={transition.revealComplete}
      />
    </>
  )
}
```

`<Suspense fallback={null}>` is deliberate. There is no spinner: the void mask *is* the loading state.

The carousel's window-level drag handler and `OrbitControls` can never fight each other: `showHub` is false exactly when `phase === 'inRoom'`, which is the only phase that mounts orbit.

- [ ] **Step 2: Write the app shell with routing**

Rewrite `src/app/App.tsx`:

```tsx
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getRoom, rooms, roomIndex } from '../content/registry'
import { browsingIn, initialState } from '../transition/machine'
import { useTransition } from '../transition/useTransition'
import { Stage } from './Stage'

/** Milliseconds the focus beat runs before the mask begins closing. */
const FOCUS_MS = 450

export function App() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // A direct landing on /p/:id opens already masked and reveals — no carousel.
  const landedInRoom = useRef(Boolean(id && getRoom(id))).current
  const transition = useTransition(landedInRoom && id ? browsingIn(id) : initialState)
  const { state, focusComplete, select, exit } = transition

  const [activeIndex, setActiveIndex] = useState(() => Math.max(roomIndex(id ?? ''), 0))

  const step = useCallback((delta: number) => {
    setActiveIndex((current) => ((current + delta) % rooms.length + rooms.length) % rooms.length)
  }, [])

  // The focusing beat is time-based; every other phase is driven by an event.
  useEffect(() => {
    if (state.phase !== 'focusing') return
    const timer = window.setTimeout(focusComplete, FOCUS_MS)
    return () => window.clearTimeout(timer)
  }, [state.phase, state.target, focusComplete])

  // The URL follows the machine, so history and the machine cannot disagree.
  useEffect(() => {
    if (state.phase === 'masking' && state.direction === 'in' && state.target) {
      navigate(`/p/${state.target}`)
    }
    if (state.phase === 'browsing') {
      navigate('/')
    }
  }, [state.phase, state.direction, state.target, navigate])

  // Back/forward: the URL changed without the machine asking. Follow it.
  useEffect(() => {
    if (!id && state.phase === 'inRoom') exit()
    if (id && state.phase === 'browsing' && getRoom(id)) select(id)
  }, [id, state.phase, exit, select])

  // Flat keyboard parity with the carousel's wheel and the XR thumbstick.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'Enter' && state.phase === 'browsing') select(rooms[activeIndex].id)
      if (event.key === 'Escape' && state.phase === 'inRoom') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, select, exit, state.phase, activeIndex])

  // Start the download the instant a selection is made, so it overlaps the
  // focus and mask animations rather than beginning after them.
  useEffect(() => {
    if (state.phase !== 'focusing' || !state.target) return
    void getRoom(state.target)?.scene.preload()
  }, [state.phase, state.target])

  return (
    <Canvas camera={{ position: [0, 0.6, 7], fov: 50 }} data-testid="scene">
      <Stage activeIndex={activeIndex} transition={transition} onStep={step} xrMode={false} />
    </Canvas>
  )
}
```

Update `src/main.tsx` to declare the routes:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/p/:id" element={<App />} />
        {/* Unknown paths land on the hub rather than a dead end. */}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

Both routes render the same `App` so entering a room never remounts the canvas — remounting would tear down the WebGL context and the transition with it.

- [ ] **Step 3: Verify by hand**

Run: `npm run dev`.

Walk each of these:
1. `/` shows the carousel. Arrow keys and the wheel step it.
2. Selecting the front item dims briefly, fades to the void, and the URL becomes `/p/<id>`.
3. The placeholder exhibit cube appears after the fade — never before it, and never a flash of a half-built room.
4. Browser **Back** fades out and returns to `/` and the carousel.
5. Reloading directly on `/p/skiwatch` opens masked and reveals the room without showing the carousel first.
6. Double-clicking the front item rapidly enters exactly once.
7. `Escape` in a room exits.
8. Inside a room, dragging orbits the camera around the plinth; back on the hub, dragging steps the carousel again.

Item 6 is the non-interruptibility invariant. Item 3 is the both-gates invariant. Item 8 proves the two drag behaviours hand off cleanly.

- [ ] **Step 4: Verify the build**

Run: `npm run build && npm run test`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: routing and app shell

Deep-linkable /p/:id with the transition machine driving history. Router
state is read outside the Canvas and passed in as props, since R3F's
reconciler root does not receive DOM-tree context."
```

---

## Task 12: The exhibit template

**Files:**
- Rewrite: `src/exhibit/Exhibit.tsx`
- Create: `src/exhibit/Plinth.tsx`
- Create: `src/exhibit/InfoPanel.tsx`

**Interfaces:**
- Consumes: `Room` (5), `DISPLAY_FONT` (10), `damp` (1).
- Produces: `Exhibit` default export, signature unchanged from Task 5 — `({ room }: { room: Room })`. Task 13 supplies its content; Task 14 teleports around it.

- [ ] **Step 1: Write the plinth**

Create `src/exhibit/Plinth.tsx`:

```tsx
export function Plinth() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.6, 0.7, 0.8, 32]} />
        <meshStandardMaterial color="#16161c" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 32]} />
        <meshStandardMaterial color="#22222c" roughness={0.7} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 2: Write the info panel**

Create `src/exhibit/InfoPanel.tsx`:

```tsx
import { Text } from '@react-three/drei'
import { useState } from 'react'
import type { Link } from '../content/schema'
import { DISPLAY_FONT } from '../lib/font'

const PANEL_WIDTH = 2.4

export function InfoPanel({
  title,
  blurb,
  links,
}: {
  title: string
  blurb: string
  links: Link[]
}) {
  return (
    <group>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[PANEL_WIDTH + 0.3, 1.5]} />
        <meshBasicMaterial color="#101017" toneMapped={false} />
      </mesh>

      <Text
        font={DISPLAY_FONT}
        position={[0, 0.5, 0]}
        fontSize={0.16}
        maxWidth={PANEL_WIDTH}
        anchorX="center"
        color="#ffffff"
      >
        {title}
      </Text>

      <Text
        font={DISPLAY_FONT}
        position={[0, 0.12, 0]}
        fontSize={0.075}
        maxWidth={PANEL_WIDTH}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#b9bfcc"
      >
        {blurb}
      </Text>

      <group position={[0, -0.52, 0]}>
        {links.map((link, index) => (
          <LinkButton
            key={link.href}
            link={link}
            position={[(index - (links.length - 1) / 2) * 0.95, 0, 0]}
          />
        ))}
      </group>
    </group>
  )
}

function LinkButton({ link, position }: { link: Link; position: [number, number, number] }) {
  const [hovered, setHovered] = useState(false)

  return (
    <group position={position}>
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(event) => {
          event.stopPropagation()
          window.open(link.href, '_blank', 'noopener,noreferrer')
        }}
      >
        <planeGeometry args={[0.85, 0.18]} />
        <meshBasicMaterial color={hovered ? '#3a5bd9' : '#1e2333'} toneMapped={false} />
      </mesh>
      <Text font={DISPLAY_FONT} position={[0, 0, 0.01]} fontSize={0.065} color="#ffffff">
        {link.label}
      </Text>
    </group>
  )
}
```

`window.open(..., 'noopener,noreferrer')` is not optional — without `noopener` the opened page gets a handle on this window via `window.opener`.

- [ ] **Step 3: Write the exhibit**

Rewrite `src/exhibit/Exhibit.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Room } from '../content/registry'
import { InfoPanel } from './InfoPanel'
import { Plinth } from './Plinth'

const SPIN_RATE = 0.35

/**
 * The template every project gets as its floor: the project's own preview
 * object on a plinth, its title and blurb on a panel behind it, and its links
 * as selectable targets. Identical furniture every time, by construction.
 */
export default function Exhibit({ room }: { room: Room }) {
  const pedestalObject = useRef<Group>(null)
  const Preview = room.preview

  useFrame((_state, delta) => {
    if (pedestalObject.current) pedestalObject.current.rotation.y += delta * SPIN_RATE
  })

  return (
    <group>
      {/* Baked-feel lighting only. No realtime shadows — they are a Quest 2
          frame-budget killer and this room has nothing to cast onto. */}
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#7f8cff', '#1a1a22', 0.7]} />
      <directionalLight position={[3, 5, 2]} intensity={0.9} castShadow={false} />

      <group position={[0, -0.9, -1.2]}>
        <Plinth />
        <group ref={pedestalObject} position={[0, 1.35, 0]}>
          <Preview selected />
        </group>
      </group>

      <group position={[0, 0.75, -2.6]}>
        <InfoPanel title={room.title} blurb={room.blurb} links={room.links} />
      </group>

      {/* Floor. Also the teleport target once Task 14 wraps it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]} name="exhibit-floor">
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#0d0d13" roughness={1} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 4: Verify by hand**

Run: `npm run dev`, enter each of the five projects in turn.

Expected: the project's own preview object turning slowly on a plinth, its real title and blurb legible, and each link opening the right URL in a new tab. Every room's furniture is laid out identically — that is the point of a template.

Check the blurbs do not overflow the panel. If one does, the fix is `content/projects.ts`, not the panel geometry — the schema's 280-character bound is what keeps this honest.

- [ ] **Step 5: Verify the build and tests**

Run: `npm run build && npm run test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: exhibit template room

Plinth, rotating preview object, info panel with title/blurb/links, and
a floor that doubles as the teleport target. Consistent by construction."
```

---

## Task 13: Distinctive previews

The placeholders from Task 5 are legible but arbitrary. Each preview should say something about its project at a glance, in the carousel and again on the plinth.

**Files:**
- Rewrite: `src/hub/previews/PapercupPreview.tsx`
- Rewrite: `src/hub/previews/SkiWatchPreview.tsx`
- Rewrite: `src/hub/previews/OpenSkiDataPreview.tsx`
- Rewrite: `src/hub/previews/ProjectBetaPreview.tsx`
- Rewrite: `src/hub/previews/BoardgamePreview.tsx`

**Interfaces:**
- Consumes: `damp` (1).
- Produces: same `({ selected }: { selected: boolean })` signature as Task 5 — the registry is unchanged.

**Budget:** each preview is mounted permanently in the carousel and again in its exhibit. Keep every one under **6 draw calls** and use no textures. Five previews therefore cost at most 30 of the 100-draw-call room budget.

**On reusing the prototype pieces.** The spec lists `circles`, `gravity`, `roulette`, `spherical`, `Carousel3D` and `WigglyMesh` from `paulkim-space` as available source material. They are deliberately not ported here. The prototype's `Carousel3D` is a stub — seven unstyled spheres — with nothing to salvage, and the rest are untyped JavaScript written against R3F v8, so porting costs more than writing a five-primitive preview from scratch. They remain genuine candidates for **room furniture** in a bespoke scene, where their behaviour is the point; they are poor candidates for previews, where the requirement is to read instantly at thumbnail scale. Revisit them when writing the M3 plan.

- [ ] **Step 1: papercup — two cups and a taut line**

Rewrite `src/hub/previews/PapercupPreview.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, type Mesh } from 'three'

/** The paper cup telephone: speak into one, it emerges from the other. */
export function PapercupPreview({ selected }: { selected: boolean }) {
  const line = useRef<Mesh>(null)
  const colour = selected ? '#ffffff' : '#9aa4b2'

  useFrame((state) => {
    if (!line.current) return
    // A standing wave along the string, only while this item is selected.
    const amplitude = selected ? 0.03 : 0
    line.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 6) * amplitude
  })

  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh position={[0.42, 0, 0]} rotation={[0, 0, Math.PI]}>
        <cylinderGeometry args={[0.24, 0.15, 0.34, 20, 1, true]} />
        <meshStandardMaterial color={colour} roughness={0.7} side={DoubleSide} />
      </mesh>
      <mesh ref={line}>
        <cylinderGeometry args={[0.008, 0.008, 0.62, 6]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh position={[-0.42, 0, 0]}>
        <cylinderGeometry args={[0.24, 0.15, 0.34, 20, 1, true]} />
        <meshStandardMaterial color={colour} roughness={0.7} side={DoubleSide} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 2: SkiWatch — a slope under a lens**

Rewrite `src/hub/previews/SkiWatchPreview.tsx`:

```tsx
export function SkiWatchPreview({ selected }: { selected: boolean }) {
  const colour = selected ? '#ffffff' : '#7fb8ff'

  return (
    <group>
      {/* The mountain. */}
      <mesh position={[0, -0.15, 0]}>
        <coneGeometry args={[0.5, 0.6, 4]} />
        <meshStandardMaterial color={colour} flatShading roughness={0.6} />
      </mesh>
      {/* The camera watching it. */}
      <mesh position={[0.3, 0.4, 0.1]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.2, 0.14, 0.14]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#4d6f9c'} roughness={0.4} />
      </mesh>
      <mesh position={[0.19, 0.4, 0.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
        <meshStandardMaterial color="#101018" roughness={0.3} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 3: open-ski-data — a node graph**

Rewrite `src/hub/previews/OpenSkiDataPreview.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { Object3D } from 'three'

const NODE_COUNT = 12

/** The registry as what it actually is: a graph of places, lifts and runs. */
export function OpenSkiDataPreview({ selected }: { selected: boolean }) {
  const nodes = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  // Deterministic pseudo-random placement on a sphere — stable across renders.
  const placements = useMemo(
    () =>
      Array.from({ length: NODE_COUNT }, (_, index) => {
        const phi = Math.acos(1 - (2 * (index + 0.5)) / NODE_COUNT)
        const theta = Math.PI * (1 + Math.sqrt(5)) * index
        return [
          Math.sin(phi) * Math.cos(theta) * 0.45,
          Math.sin(phi) * Math.sin(theta) * 0.45,
          Math.cos(phi) * 0.45,
        ] as const
      }),
    [],
  )

  useFrame((state) => {
    if (!nodes.current) return
    placements.forEach((position, index) => {
      const pulse = selected ? 1 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.25 : 1
      dummy.position.set(position[0], position[1], position[2])
      dummy.scale.setScalar(pulse)
      dummy.updateMatrix()
      nodes.current!.setMatrixAt(index, dummy.matrix)
    })
    nodes.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* One draw call for all twelve nodes. */}
      <instancedMesh ref={nodes} args={[undefined, undefined, NODE_COUNT]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#8ce0c0'} roughness={0.4} />
      </instancedMesh>
      {/* One more for the shell they sit on. */}
      <mesh>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshBasicMaterial color={selected ? '#5f7f74' : '#2c4b41'} wireframe toneMapped={false} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 4: project-beta — a climbing hold and a traced path**

Rewrite `src/hub/previews/ProjectBetaPreview.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Vector3, type Mesh } from 'three'

/** The movement path a climber traces between holds. */
export function ProjectBetaPreview({ selected }: { selected: boolean }) {
  const marker = useRef<Mesh>(null)

  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-0.3, -0.45, 0),
        new Vector3(0.2, -0.15, 0.12),
        new Vector3(-0.15, 0.15, -0.1),
        new Vector3(0.28, 0.45, 0),
      ]),
    [],
  )

  useFrame((state) => {
    if (!marker.current) return
    const t = selected ? (state.clock.elapsedTime * 0.25) % 1 : 0.5
    marker.current.position.copy(curve.getPointAt(t))
  })

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 32, 0.012, 6, false]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#ffb27f'} roughness={0.5} />
      </mesh>
      <mesh ref={marker}>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial
          color={selected ? '#ffffff' : '#ff7f50'}
          emissive={selected ? '#ff7f50' : '#000000'}
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh position={[0.28, 0.45, 0]}>
        <dodecahedronGeometry args={[0.11]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#c2734a'} flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 5: cli-p2p-boardgame — two boards, one link**

Rewrite `src/hub/previews/BoardgamePreview.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

/** Two peers, no server: a board on each side and a packet crossing between. */
export function BoardgamePreview({ selected }: { selected: boolean }) {
  const packet = useRef<Mesh>(null)
  const colour = selected ? '#ffffff' : '#c79aff'

  useFrame((state) => {
    if (!packet.current) return
    const t = selected ? Math.sin(state.clock.elapsedTime * 1.6) : 0
    packet.current.position.x = t * 0.34
  })

  return (
    <group rotation={[0.35, 0.4, 0]}>
      <mesh position={[-0.36, 0, 0]}>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh position={[0.36, 0, 0]}>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh ref={packet} position={[0, 0.16, 0]}>
        <octahedronGeometry args={[0.07]} />
        <meshStandardMaterial
          color={selected ? '#ffffff' : '#e0c0ff'}
          emissive={selected ? '#8855ff' : '#000000'}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  )
}
```

- [ ] **Step 6: Verify by hand**

Run: `npm run dev`.

Expected:
- Five visually distinct objects on the ring, each recognisably about its project.
- Only the front item animates. Idle items must be still — five simultaneous animations is noise, and on a Quest it is wasted frame budget.
- Each object reads correctly at exhibit scale too, since the same component is on the plinth.

- [ ] **Step 7: Verify the build and tests**

Run: `npm run build && npm run test`
Expected: both clean, all registry tests still passing (signatures unchanged).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: distinctive per-project preview objects

Each project gets an object that says something about it. Instanced
where count justifies it; only the selected item animates."
```

---

## Task 14: XR mode

**Files:**
- Create: `src/xr/store.ts`
- Create: `src/xr/useXrSupport.ts`
- Create: `src/xr/TeleportFloor.tsx`
- Create: `src/app/EnterXrButton.tsx`
- Modify: `src/app/App.tsx`, `src/app/Stage.tsx`
- Test: `tests/unit/xr/useXrSupport.test.ts`

**Interfaces:**
- Consumes: `Stage` (11), `Exhibit` floor (12).
- Produces:
  - `xrStore` from `src/xr/store.ts`
  - `useXrSupport(): boolean | null` — `null` while probing, then the answer
  - `<TeleportFloor onTeleport={(position: Vector3) => void}>{children}</TeleportFloor>`
  - `<EnterXrButton />`

- [ ] **Step 1: Write the failing test for the support probe**

Create `tests/unit/xr/useXrSupport.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useXrSupport } from '../../../src/xr/useXrSupport'

const setXr = (value: unknown) => {
  Object.defineProperty(navigator, 'xr', { value, configurable: true, writable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'xr')
  vi.restoreAllMocks()
})

describe('useXrSupport', () => {
  test('reports false when navigator.xr is absent', async () => {
    Reflect.deleteProperty(navigator, 'xr')
    const { result } = renderHook(() => useXrSupport())
    await waitFor(() => expect(result.current).toBe(false))
  })

  test('reports true when immersive-vr is supported', async () => {
    setXr({ isSessionSupported: vi.fn().mockResolvedValue(true) })
    const { result } = renderHook(() => useXrSupport())
    await waitFor(() => expect(result.current).toBe(true))
  })

  test('reports false when immersive-vr is unsupported', async () => {
    setXr({ isSessionSupported: vi.fn().mockResolvedValue(false) })
    const { result } = renderHook(() => useXrSupport())
    await waitFor(() => expect(result.current).toBe(false))
  })

  test('reports false rather than throwing when the probe rejects', async () => {
    setXr({ isSessionSupported: vi.fn().mockRejectedValue(new Error('nope')) })
    const { result } = renderHook(() => useXrSupport())
    await waitFor(() => expect(result.current).toBe(false))
  })

  test('probes for immersive-vr, never immersive-ar', async () => {
    const probe = vi.fn().mockResolvedValue(true)
    setXr({ isSessionSupported: probe })
    renderHook(() => useXrSupport())
    await waitFor(() => expect(probe).toHaveBeenCalledWith('immersive-vr'))
  })
})
```

Install the testing library if it is not already present:

```bash
npm install -D @testing-library/react @testing-library/dom
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/xr/useXrSupport.test.ts`
Expected: FAIL — cannot resolve `src/xr/useXrSupport`.

- [ ] **Step 3: Write the probe**

Create `src/xr/useXrSupport.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * Whether this browser can start an immersive-vr session.
 * `null` while the probe is in flight — render no XR affordance until it settles.
 */
export function useXrSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!('xr' in navigator) || !navigator.xr) {
      setSupported(false)
      return
    }

    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((result) => {
        if (!cancelled) setSupported(result)
      })
      .catch(() => {
        if (!cancelled) setSupported(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return supported
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/xr/useXrSupport.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the store and the button**

Create `src/xr/store.ts`:

```ts
import { createXRStore } from '@react-three/xr'

/**
 * Module-level singleton: the store must outlive re-renders or an in-flight
 * session is orphaned. immersive-vr only — passthrough is out of scope for v1.
 */
export const xrStore = createXRStore()
```

Create `src/app/EnterXrButton.tsx`:

```tsx
import { useXrSupport } from '../xr/useXrSupport'
import { xrStore } from '../xr/store'

export function EnterXrButton() {
  const supported = useXrSupport()

  // Render nothing while probing and nothing when unsupported. A dead "Enter VR"
  // button on a laptop is worse than no button.
  if (supported !== true) return null

  return (
    <button
      type="button"
      onClick={() => xrStore.enterVR()}
      style={{
        position: 'absolute',
        zIndex: 1,
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '14px 28px',
        fontSize: 18,
        borderRadius: 999,
        border: '1px solid #3a5bd9',
        background: '#12141c',
        color: '#fff',
        cursor: 'pointer',
      }}
    >
      Enter VR
    </button>
  )
}
```

- [ ] **Step 6: Write the teleport floor**

Create `src/xr/TeleportFloor.tsx`:

```tsx
import { TeleportTarget } from '@react-three/xr'
import type { ReactNode } from 'react'
import type { Vector3 } from 'three'

/**
 * Teleport locomotion only. Smooth locomotion is the primary nausea source and
 * is not worth the risk on a portfolio someone tries once.
 */
export function TeleportFloor({
  onTeleport,
  children,
}: {
  onTeleport: (position: Vector3) => void
  children: ReactNode
}) {
  return <TeleportTarget onTeleport={onTeleport}>{children}</TeleportTarget>
}
```

If `TeleportTarget` is not exported by the installed `@react-three/xr`, check the v6 API before improvising — `npx @context7/cli` or the package's own `README.md` under `node_modules/@react-three/xr/`. Do not fall back to smooth locomotion.

- [ ] **Step 7: Wire XR into the shell**

In `src/app/App.tsx`:

- Add imports: `import { XR, XROrigin } from '@react-three/xr'`, `import { Vector3 } from 'three'`, plus `xrStore`, `EnterXrButton` and `TeleportFloor`.
- Track the origin position: `const [origin, setOrigin] = useState(() => new Vector3(0, 0, 0))`.
- Track whether a session is live so `Stage` can pick its mask rendering:

```tsx
const [inXr, setInXr] = useState(false)
useEffect(() => xrStore.subscribe((state) => setInXr(Boolean(state.session))), [])
```

- Wrap the canvas contents and add the button:

```tsx
return (
  <>
    <EnterXrButton />
    <Canvas camera={{ position: [0, 0.6, 7], fov: 50 }} data-testid="scene">
      <XR store={xrStore}>
        <XROrigin position={origin} />
        <TeleportFloor onTeleport={setOrigin}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]} visible={false}>
            <circleGeometry args={[10, 48]} />
          </mesh>
        </TeleportFloor>
        <Stage
          activeIndex={activeIndex}
          transition={transition}
          onStep={step}
          xrMode={inXr}
        />
      </XR>
    </Canvas>
  </>
)
```

`EnterXrButton` sits outside `<Canvas>` because it is DOM, and because `useXrSupport` is a DOM-tree hook.

In `src/app/Stage.tsx`, `xrMode` already selects the mask rendering — no change needed beyond confirming it is threaded through.

- [ ] **Step 8: Add XR thumbstick stepping to the carousel**

Flat parity requires the thumbstick do what the wheel does. In `src/hub/Carousel3D.tsx`, add:

```tsx
import { useXRInputSourceState } from '@react-three/xr'

/** One carousel step per thumbstick push; releasing past this rearms it. */
const STICK_THRESHOLD = 0.6
const STICK_RELEASE = 0.25

function useThumbstickStep(onStep: (delta: number) => void, enabled: boolean) {
  const armed = useRef(true)
  const controller = useXRInputSourceState('controller', 'right')

  useFrame(() => {
    if (!enabled || !controller?.gamepad) return
    const x = controller.gamepad['xr-standard-thumbstick']?.xAxis ?? 0

    if (armed.current && Math.abs(x) > STICK_THRESHOLD) {
      onStep(Math.sign(x))
      armed.current = false
    } else if (!armed.current && Math.abs(x) < STICK_RELEASE) {
      armed.current = true
    }
  })
}
```

Call `useThumbstickStep(onStep, !dimmed)` inside `Carousel3D`. The arm/release hysteresis is what stops a held stick spinning the ring at 72 steps per second.

Confirm the `useXRInputSourceState` signature against the installed v6 package before relying on the axis path.

- [ ] **Step 9: Verify flat, then on device**

Run: `npm run dev` on the desktop first.

Expected: **no** "Enter VR" button (no headset runtime), and the carousel and rooms behave exactly as before. XR code must never degrade the flat experience.

Then bring the funnel up as in Task 2 and load it on the Quest:

```bash
tailscale funnel --bg 5173
```

On the Quest, check:
- "Enter VR" appears.
- Entering VR shows the carousel in front of you at a comfortable distance.
- The right thumbstick steps the ring one item per push, not continuously.
- Ray-selecting the front item fades the view to solid dark **from all sides**, with no clipping through your face — that is the inverted-sphere path in `VoidMask`.
- The room appears after the fade, and teleporting moves you without nausea.
- Exiting returns to the carousel.

Close the funnel:

```bash
tailscale funnel --bg off
```

- [ ] **Step 10: Verify the build and tests**

Run: `npm run build && npm run test`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: XR mode with teleport locomotion

immersive-vr session, support-gated entry button, thumbstick carousel
stepping with hysteresis, and teleport-only movement."
```

---

## Task 15: Flat-mode end-to-end smoke tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/homepage.spec.ts`

**Interfaces:**
- Consumes: the built site.
- Produces: `npm run e2e`. Task 16's workflow runs it before deploying.

- [ ] **Step 1: Write the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    launchOptions: {
      // Headless Chromium needs a software rasteriser for WebGL. Without this
      // the canvas exists but never renders and every test fails opaquely.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Tests the real production build, including the 404 shim and asset paths.
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 2: Write the specs**

Create `tests/e2e/homepage.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

/** Fails the test on any console error, which is how R3F reports most breakage. */
function failOnConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** Waits until the WebGL canvas has actually drawn something. */
async function waitForRender(page: Page) {
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox()
      return box ? box.width * box.height : 0
    })
    .toBeGreaterThan(0)
  await page.waitForTimeout(1200) // let the carousel settle
}

test('the hub loads and renders without console errors', async ({ page }) => {
  const errors = failOnConsoleErrors(page)
  await page.goto('/')
  await waitForRender(page)
  expect(errors).toEqual([])
})

test('the page has a title and a description', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Paul Kim/)
  const description = page.locator('meta[name="description"]')
  await expect(description).toHaveAttribute('content', /.+/)
})

test('a deep link mounts the room directly', async ({ page }) => {
  const errors = failOnConsoleErrors(page)
  await page.goto('/p/papercup')
  await waitForRender(page)
  await expect(page).toHaveURL(/\/p\/papercup$/)
  expect(errors).toEqual([])
})

test('every project deep link loads', async ({ page }) => {
  for (const id of ['papercup', 'skiwatch', 'open-ski-data', 'project-beta', 'cli-p2p-boardgame']) {
    const errors = failOnConsoleErrors(page)
    await page.goto(`/p/${id}`)
    await waitForRender(page)
    expect(errors, `console errors on /p/${id}`).toEqual([])
  }
})

test('an unknown project id falls back to the hub without crashing', async ({ page }) => {
  const errors = failOnConsoleErrors(page)
  await page.goto('/p/not-a-real-project')
  await waitForRender(page)
  expect(errors).toEqual([])
})

test('arrow keys step the carousel and Enter opens a room', async ({ page }) => {
  await page.goto('/')
  await waitForRender(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(600)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/p\/[a-z0-9-]+$/, { timeout: 5000 })
})

test('Escape leaves a room and returns to the hub', async ({ page }) => {
  await page.goto('/p/skiwatch')
  await waitForRender(page)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 })
})

test('no "Enter VR" button appears without a headset', async ({ page }) => {
  await page.goto('/')
  await waitForRender(page)
  await expect(page.getByRole('button', { name: 'Enter VR' })).toHaveCount(0)
})
```

The keyboard tests carry real weight: they are the only automated proof that flat mode is a complete experience rather than a degraded one, since the pointer path and the keyboard path reach the same `onStep` and `select` as the XR thumbstick does.

- [ ] **Step 3: Install browsers and run**

```bash
npx playwright install --with-deps chromium
npm run e2e
```

Expected: 8 tests pass.

If the canvas renders black and tests time out, the SwiftShader flags in `launchOptions` are not taking effect — verify with a one-off `page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: flat-mode end-to-end smoke suite

Covers hub render, every deep link, unknown-id fallback, keyboard
parity, and the absence of a dead Enter VR button. Runs against the
production build with SwiftShader WebGL."
```

---

## Task 16: Deploy to GitHub Pages

**Files:**
- Create: `public/404.html`
- Create: `public/.nojekyll`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run build`, `npm run test`, `npm run e2e`.
- Produces: a live site at `https://paulkim-xr.github.io`.

- [ ] **Step 1: Write the SPA redirect shim**

GitHub Pages serves `404.html` for any path with no matching file, so `/p/papercup` 404s on a hard load. The shim encodes the path into a query string, and the snippet already in `index.html` (Task 1) decodes it before the router runs.

Create `public/404.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Paul Kim — XR</title>
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages — https://github.com/rafgraph/spa-github-pages
      // 0 because this is a user-scoped site serving at the domain root. A
      // project-page repo would need 1.
      var pathSegmentsToKeep = 0

      var l = window.location
      l.replace(
        l.protocol +
          '//' +
          l.hostname +
          (l.port ? ':' + l.port : '') +
          l.pathname
            .split('/')
            .slice(0, 1 + pathSegmentsToKeep)
            .join('/') +
          '/?/' +
          l.pathname
            .slice(1)
            .split('/')
            .slice(pathSegmentsToKeep)
            .join('/')
            .replace(/&/g, '~and~') +
          (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
          l.hash,
      )
    </script>
  </head>
  <body></body>
</html>
```

Create an empty `public/.nojekyll`:

```bash
touch public/.nojekyll
```

Without it, Pages runs Jekyll, which ignores files and directories beginning with an underscore — a class of Vite output.

- [ ] **Step 2: Verify the shim against a real preview server**

```bash
npm run build
npx serve dist -s=false -l 4174 2>/dev/null || npx http-server dist -p 4174
```

Open `http://localhost:4174/p/papercup`. A plain static server without SPA fallback should serve `404.html`, bounce to `/?/p/papercup`, and land back on `/p/papercup` with the room loading.

If the URL stays at `/?/p/papercup`, the decode snippet in `index.html` is missing or placed after the module script.

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Never let two deploys race; let a newer push finish rather than cancel it.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Unit tests with coverage thresholds
        run: npm run coverage

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Flat-mode end-to-end tests
        run: npm run e2e

      - name: Build
        run: npm run build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Tests gate the deploy. A green build that ships a broken carousel is worse than a red one.

- [ ] **Step 4: Enable Pages with GitHub Actions as the source**

```bash
gh api -X POST repos/paulkim-xr/paulkim-xr.github.io/pages \
  -f 'build_type=workflow' 2>/dev/null \
  || gh api -X PUT repos/paulkim-xr/paulkim-xr.github.io/pages -f 'build_type=workflow'
```

Verify: `gh api repos/paulkim-xr/paulkim-xr.github.io/pages --jq '{build_type, html_url}'`
Expected: `build_type` is `workflow`.

If the API path is blocked, set it by hand: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

- [ ] **Step 5: Push and watch the run**

```bash
git add -A
git commit -m "ci: deploy to GitHub Pages via Actions

Unit and e2e tests gate the deploy. Adds the spa-github-pages 404 shim
for deep links and .nojekyll so Pages leaves the build output alone."
git push
gh run watch
```

Expected: the workflow goes green and reports a page URL.

- [ ] **Step 6: Verify the live site**

Check each, in a browser and then on the Quest:

- `https://paulkim-xr.github.io` — carousel renders.
- `https://paulkim-xr.github.io/p/papercup` — pasted cold into the address bar, loads the room after one invisible redirect bounce.
- Every link in every info panel opens the right repo.
- On the Quest: "Enter VR" appears — this is the first time the site has been reachable over real HTTPS with no funnel.

If assets 404 with a doubled path segment, something set Vite `base`. It must be absent.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: <whatever the live check turned up>"
git push
```

---

## Task 17: On-device performance pass

The spec is explicit that Quest 2 performance problems are structural: found late, they mean redesigning rather than tweaking. This task is where the stated budget is actually measured.

**Files:**
- Modify: whichever modules the measurements implicate
- Create: `docs/quest-performance.md`

**Interfaces:**
- Consumes: the deployed site.
- Produces: a recorded measurement against the budget.

- [ ] **Step 1: Instrument draw calls in development**

Add a temporary readout to `src/app/Stage.tsx`:

```tsx
import { useFrame, useThree } from '@react-three/fiber'

function DrawCallProbe() {
  const gl = useThree((state) => state.gl)
  const frame = useRef(0)

  useFrame(() => {
    frame.current += 1
    if (frame.current % 120 !== 0) return
    const { calls, triangles } = gl.info.render
    console.info(`draw calls: ${calls}  triangles: ${triangles}  programs: ${gl.info.programs?.length}`)
  })

  return null
}
```

Render `<DrawCallProbe />` inside `Stage` only when `import.meta.env.DEV`.

- [ ] **Step 2: Measure each scene**

Run `npm run dev` and record, from the console, for the hub and each of the five rooms:

| Scene | Draw calls | Triangles | Programs |
|---|---|---|---|

Budget: **under 100 draw calls per room**.

- [ ] **Step 3: Measure frame time on the Quest**

Bring the funnel up, load the site on the Quest, enter VR, and use the Meta Quest Developer Hub performance overlay (or `adb shell dumpsys SurfaceFlinger --latency`) to record the frame time in the hub and in one room.

Budget: **13.8ms** (72Hz).

- [ ] **Step 4: Fix whatever exceeds budget, in this order**

1. **Draw calls first.** Merge static geometry; instance anything repeated. The carousel is the obvious candidate if it is over — five previews at six calls each plus furniture adds up.
2. **Overdraw second.** Transparent, full-view surfaces are the expensive kind, and the void mask is exactly that. If frame time spikes only during a transition, the mask is the cause: reduce the sphere's segment count, or make it opaque and cross-fade instead.
3. **Confirm no postprocessing is mounted in XR** — the spec forbids it outright.
4. **Confirm no realtime shadows** — `castShadow` and `receiveShadow` must be absent or false everywhere, and `<Canvas shadows>` must not be set.

- [ ] **Step 5: Record the results**

Create `docs/quest-performance.md` with the before/after table, the frame times, and any change made in response. Note anything left over budget and why.

- [ ] **Step 6: Remove the probe**

Delete `DrawCallProbe` and its render site. It has served its purpose and would otherwise ship dead code.

- [ ] **Step 7: Verify and ship**

```bash
npm run build && npm run test && npm run e2e
git add -A
git commit -m "perf: Quest 2 on-device performance pass

Measured draw calls and frame time against the 72Hz budget and recorded
the results. <summarise any fixes here.>"
git push
gh run watch
```

---

## Done

At the end of Task 17 the site is live at `https://paulkim-xr.github.io`, deep-linkable, complete in flat mode, enterable in VR on a Quest 2, and inside its stated frame budget.

**Next plan — M3:** the bespoke `papercup` audio-reactive string room. Its shape depends on Task 3's findings about `getUserMedia` inside an `immersive-vr` session. Graduating the project is one line in `src/content/registry.tsx`:

```ts
papercup: { preview: PapercupPreview, scene: lazyScene(() => import('../rooms/papercup/StringRoom')) },
```
