# XR-Native Personal Homepage — Design

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning
**Repo:** `paulkim-xr/paulkim-xr.github.io` (new). `paulkim-space` remains as the archived Next.js prototype.

## Purpose

A personal homepage that is simultaneously a portfolio, a showcase piece, and a living XR lab.

Three goals, all real, in priority order when they conflict:

1. **Readable.** Someone who lands on it with no headset must be able to learn what Paul builds and reach the repos. Flat mode is a complete experience, not a degraded one.
2. **Memorable.** The site itself is the flagship demo. Presentation is 3D by default.
3. **XR-native.** Every space is enterable in a headset. XR is a first-class mode, not a bolt-on.

Success means: a recruiter understands the work in 30 seconds on a laptop, and a headset user can walk into any project.

## Scope

### Projects included

| Project | Account | Tier (v1) |
|---|---|---|
| `papercup` | powder-nomad | **Bespoke scene** — audio-reactive string room |
| `SkiWatch` | powder-nomad | Exhibit |
| `open-ski-data` | powder-nomad | Exhibit |
| `project-beta` | powder-nomad | Exhibit |
| `cli-p2p-boardgame` | paulkim-xr | Exhibit |

Explicitly excluded as not presentable: `japan-ski-plans`, `manatee-backend`, `slopes`, `gachaRCT`, `IST412`, and older school work. `paulkim-space` is the prototype, not an entry.

The site spans two GitHub accounts. This is intentional — the homepage is the thing that unifies them. It has no bearing on repo naming; a user-scoped site linking to another account's repos is ordinary.

### Existing 3D pieces available for reuse

From the two prototypes: `circles`, `gravity`, `roulette`, `spherical`, `Carousel3D`, `WigglyMesh`. These are source material for previews and room furniture, not standalone entries.

### Out of scope for v1

- `immersive-ar` / passthrough. Quest 2's passthrough is low-resolution greyscale; half-supporting it is worse than not claiming it.
- Smooth locomotion. Teleport only (see Comfort).
- Any server, database, or authenticated surface.
- Bespoke scenes for projects other than `papercup`.

## Tiering model

Every project gets the **exhibit template** as its floor. Any project can **graduate** to a bespoke interactive scene. No project is permanently capped at exhibit, and no project blocks launch by lacking a bespoke scene.

v1 ships one graduated room (`papercup`) and four exhibits. Graduating a project later is a one-line change (see `Room`).

## Architecture

### Stack

- **Vite + React 19 + TypeScript**
- **@react-three/fiber 9**, **drei**, **@react-three/xr 6**, **three 0.184**
- Matches the existing local `webxr-frontend` workspace.

Next.js is explicitly rejected. The site needs no server, and `output: 'export'` — required for static hosting — disables the API routes that would be the only reason to carry Next's weight.

### Module layout

```
src/
  app/          shell, router, XR session lifecycle
  hub/          Carousel3D — the project ring
  transition/   void mask + scene swap state machine
  rooms/        one module per project with a bespoke scene
  exhibit/      the template room
  content/      project metadata; data only, no code
  xr/           locomotion, controllers, comfort
  lib/          shared hooks and utilities
```

### The `Room` interface

```ts
type Room = {
  id: string
  title: string
  blurb: string
  links: { label: string; href: string }[]
  preview: ComponentType      // object shown in the carousel
  scene: LazyExoticComponent  // what waits behind the void
}
```

Three properties earn this shape:

- **`preview` and `scene` are separate.** The carousel mounts only previews — cheap and always resident. Scenes are `React.lazy`, so a room's code, geometry and textures are absent from the initial bundle. Five rooms do not cost a five-room download.
- **Graduation is mechanical.** `scene: lazy(() => import('./exhibit/Exhibit'))` becomes `scene: lazy(() => import('./rooms/papercup/StringRoom'))`. Nothing else changes.
- **Content is data.** `content/` holds copy, links and metadata as plain values. The registry that assembles a `Room` binds those values to `preview` / `scene` component references; editing a blurb touches only the data, never a component.

### Routing

`react-router` with real paths: `/` for the hub, `/p/:id` for a room. Deep links matter — they are how a project gets shared or put in an application. Entering a room pushes history; exiting pops it. Landing directly on `/p/papercup` skips the carousel and opens masked, then reveals.

GitHub Pages has no SPA fallback, so deep links require the [`spa-github-pages`](https://github.com/rafgraph/spa-github-pages) `404.html` redirect shim. Cost is one redirect bounce on direct entry, invisible in practice. `HashRouter` would avoid the shim but produces `/#/p/papercup`, which is worse to share — rejected.

The exhibit template accepts a `Room` and composes identical furniture every time: representative object on a plinth, title, blurb panel, media planes, repo link. Consistent by construction.

## The transition — the site's spine

The carousel → zoom → monochrome void mechanic is core architecture, not late polish. It does three jobs at once: it is the visual identity, it is the loading mask, and it is the XR comfort fade.

### State machine

```
browsing → focusing → masking → swapping → revealing → inRoom
```

with the symmetric reverse on exit.

Two invariants:

- **Non-interruptible past `masking`.** A fast double-select must not start two loads.
- **The mask holds until both the animation has completed and Suspense has resolved.** Fast assets still get the full aesthetic beat; slow assets simply hold longer. There is never a spinner and never a cut to a half-loaded room.

### Two renderings, one machine

- **Flat:** the selected object's material swaps to unlit monochrome and scales to fill the frustum.
- **XR:** an inverted sphere parented to the camera rig — `side: BackSide`, unlit, radius closing in. World-scaled geometry cannot fill a headset's view without clipping through the viewer's face. This is the standard comfortable-fade pattern.

## Flat / XR parity

Flat mode is complete. Most visitors will not have a headset.

| | Flat | XR |
|---|---|---|
| Carousel | scroll / drag | thumbstick + ray-select |
| Room navigation | orbit | teleport |
| Entry | default | "Enter VR" button |

The "Enter VR" affordance renders only when `navigator.xr?.isSessionSupported('immersive-vr')` resolves true.

### Comfort

Teleport locomotion only in v1. Smooth locomotion is the primary nausea source and is not worth the risk on a portfolio someone tries once.

## The papercup room

A paper cup telephone is two cups and a taut string: you speak into one, the vibration travels the line, it emerges at the other. This is literally what `papercup` does — voice travels into a machine in the homelab and returns. The metaphor is exact rather than decorative.

Design:

- A **standing wave** — a line of points displaced by summed harmonics. A few hundred vertices of per-frame math, comfortably inside Quest 2's budget.
- Driven by **real audio**: `getUserMedia` → Web Audio `AnalyserNode` → per-frame FFT → string displacement. Speaking moves the string.
- A field of strings on differing harmonic modes gives the room its visual vocabulary; one of them is yours.
- **Graceful degradation:** mic access requires permission and a user gesture. On denial, the same displacement is driven by a synthesized waveform and the room still works.

## Performance budget — Quest 2

72Hz, so 13.8ms per frame. On Snapdragon XR2 the killers are draw calls and overdraw, not triangle count.

- Instance the carousel
- **No postprocessing in XR**
- Textures ≤1024 for panels; KTX2/basis if size demands
- Baked lighting; no realtime shadows in XR
- Target <100 draw calls per room

Test on device from M1 onward. Quest 2 performance problems are structural; discovering them at the end means redesigning rather than tweaking.

## Testing

There is no headless WebXR runtime, so immersive sessions cannot be meaningfully automated. The strategy tests what is testable and is honest about the rest.

- **Vitest:** transition reducer (a pure state machine), content schema validation, `Room` registry integrity — every project has required fields, links are well-formed.
- **Playwright:** flat-mode smoke — page loads, carousel renders, deep link `/p/papercup` mounts the correct room, no console errors.
- **Manual Quest checklist** per milestone, over the Tailscale funnel.

**Coverage deviation.** The global 80% coverage rule applies to `lib/`, `transition/`, and `content/`. It is deliberately not pursued for R3F scene components: asserting on a three.js scene graph tests three.js, not this codebase. Coverage is held on logic and not chased in rendering. This deviation was raised and accepted.

## Hosting and deployment

**GitHub Pages**, from the `paulkim-xr.github.io` repo, built and deployed by GitHub Actions. Custom domain later if wanted — GH Pages supports one free, with HTTPS.

Rationale: a user-scoped site repo serves at the **domain root**, so no Vite `base` configuration is needed. A project repo would serve under `/paulkim-space/` and require `base: '/paulkim-space/'`, which is a standing footgun for GLB and texture URLs in R3F — the class of bug that works in dev and breaks only in production. Root-serving removes it entirely. The repo name is also the canonical "this is my homepage" signal.

Its one real deficiency is the missing SPA fallback, handled by the `404.html` shim described under Routing.

**Repo choice does not lock hosting.** Cloudflare Pages builds directly from a GitHub repo, so if the redirect shim ever becomes irritating — or a serverless function is wanted — pointing CF Pages at this same repo is a connect-and-build operation with no migration and no restructuring. Both can even run simultaneously on different domains.

**On future secrets:** neither v1 project needs a runtime key, and the capability is preserved by build output rather than by hosting choice. A Vite SPA compiles to a static `dist/` that deploys unchanged to GH Pages, Vercel, or CF Pages. If a secret is ever needed, add a single Cloudflare Worker on `api.<domain>` and leave the site on GH Pages calling out to it — no rewrite, no host migration, roughly an hour of work. Adopting a server framework now to hedge a maybe is the trap being avoided.

Home-server-over-tunnel is rejected as primary hosting: a portfolio that is down because a laptop lid closed is worse than no portfolio. The tunnel remains the dev and demo path.

## Local test loop

Tailscale is installed and authenticated inside the dev VM (`snowple.tail709630.ts.net`), so no host-side configuration is required.

WebXR requires a **secure context**. `http://192.168.x.x:5173` does not qualify — a headset will load the page and silently report no XR support, which presents as a code bug but is a transport problem.

- **`tailscale serve`** — tailnet-only HTTPS. Not publicly reachable; no public DNS record is created.
- **`tailscale funnel`** — public HTTPS. Required for Quest 2, which has no Tailscale client (no Quest store build; sideloading is unsupported and not worth it). Enabled during dev sessions, `off` afterward.

Caveat accepted: issuing the certificate writes the hostname into public Certificate Transparency logs, so the *name* is discoverable by CT scanning even when nothing is reachable behind it.

Alternative with no public exposure: forward `laptop:5173` → `snowple` over the tailnet, then `adb reverse` over USB so the headset sees `localhost`. More moving parts; kept in reserve.

## Milestones

- **M0 — Spike.** Verify the two load-bearing assumptions: the funnel→Quest loop works, and `getUserMedia` succeeds *inside* an `immersive-vr` session on Quest Browser. Both are assumed by the design above.
- **M1 — Skeleton.** Shell, router, carousel with five placeholder previews, transition machine, one placeholder room. Works flat and in XR. Device testing starts here.
- **M2 — Content.** Exhibit template plus real content for the four exhibit projects. **Shippable.**
- **M3 — Depth.** The papercup string room.
- **M4 — Ship.** On-device performance pass, deploy to GitHub Pages via Actions.

M2 is a genuine, complete site. M3 and M4 follow without blocking it.

## Risks

| Risk | Mitigation |
|---|---|
| Mic denied or unavailable inside XR session | M0 spike; synthesized-waveform fallback designed in |
| Quest 2 performance falls short | Device testing from M1, not M4; budget stated above |
| Scope creep back toward five bespoke scenes | Tiering model; M2 is the ship point |
| Bespoke room diverges from template contract | Both satisfy the same `Room` type |
