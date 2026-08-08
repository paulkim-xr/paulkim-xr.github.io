# Spatial Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every room one input vocabulary, so that a visitor on a phone can move through all three rooms and a new kind of space can be added without inventing a control scheme for it.

**Architecture:** Four layers — `device signals → technique → intents → domain → pose → rig`. Everything from technique to pose is pure and unit-tested; only the rig touches the scene. Rooms stop writing `camera.position` and emit a pose instead.

**Tech Stack:** TypeScript 6 (strict), React 19, three 0.184, @react-three/fiber 9, Vitest 4, Playwright.

**Spec:** `docs/specs/2026-08-08-spatial-navigation-design.md`

## Global Constraints

- `npm run build` is `tsc --noEmit && vite build`. A type error aborts it and leaves `dist/` holding the **previous** bundle. Never believe a mutation check without first confirming the build is green.
- Coverage thresholds are 80% on lines, functions, branches and statements, over the explicit allow-list in `vite.config.ts`. Every new pure module must be added to that list in the same task that creates it.
- Movement demands (`advance`, `strafe`) are normalised −1..1; the domain scales them by its own pace. Orientation demands (`yaw`, `pitch`) are absolute radians.
- No room may reference `camera` once its task is done. The rig owns it.
- Immutable style throughout: functions return new objects, never mutate arguments. This is the existing convention in `walk.ts`, `stroll.ts` and `travel.ts`.
- Commit messages: `<type>: <description>` (feat, fix, refactor, docs, test, chore). No attribution trailer.
- Run unit tests with `npm test`, e2e with `npm run e2e`, coverage with `npm run coverage`.

---

## File Structure

**Created:**

| file | responsibility |
|---|---|
| `src/space/intents.ts` | the six-field intent struct, summing, clamping |
| `src/space/pose.ts` | `Pose`, and building an orientation from facing + up |
| `src/space/gesture.ts` | pure pointer state machine: look / advance / act |
| `src/space/technique.ts` | `Technique` interface, `Signals`, running a list |
| `src/space/techniques/keys.ts` | keyboard technique |
| `src/space/techniques/pointer.ts` | pointer technique, built on `gesture.ts` |
| `src/space/domain.ts` | `Domain` and `Embodied` interfaces |
| `src/space/coverage.ts` | `needs` × device-profile check |
| `src/space/domains/shell.ts` | S² — SVR |
| `src/space/domains/corridor.ts` | R² box — papercup |
| `src/space/domains/mountain.ts` | graph — open-ski-data |
| `src/space/domains/cycle.ts` | Z/n — the hub |
| `src/space/useNavigation.ts` | hook: collect signals, run techniques, step the domain |
| `src/space/Rig.tsx` | applies a pose to the camera |

**Modified:** `src/rooms/svr/SphericalRoom.tsx`, `src/rooms/papercup/StringRoom.tsx`, `src/rooms/openSkiData/MountainRoom.tsx`, `src/app/App.tsx`, `src/hub/MorphHub.tsx`, `vite.config.ts`, `tests/e2e/mobile.spec.ts`.

**Deleted at the end:** `src/rooms/svr/useFirstPerson.ts`, `src/rooms/papercup/useCorridorWalk.ts`, `src/rooms/controls.ts` and `tests/unit/rooms/controls.test.ts`.

**Kept and reused, not rewritten:** `walk.ts`, `gaze.ts`, `stroll.ts`, `travel.ts`, `graph.ts`, `terrain.ts` and all their existing tests. The domains wrap them.

---

### Task 1: Intents

**Files:**
- Create: `src/space/intents.ts`
- Test: `tests/unit/space/intents.test.ts`
- Modify: `vite.config.ts` (coverage allow-list)

**Interfaces:**
- Consumes: nothing.
- Produces: `type IntentField`, `type Intents`, `const NO_INTENTS: Intents`, `function sumIntents(parts: readonly Intents[]): Intents`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/intents.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NO_INTENTS, sumIntents, type Intents } from '../../../src/space/intents'

const demanding = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('summing what the techniques asked for', () => {
  test('nothing asked for is nothing done', () => {
    expect(sumIntents([])).toEqual(NO_INTENTS)
  })

  test('two techniques pushing the same way add up', () => {
    // Radians, so they are the same quantity by the time they are intents:
    // a held key integrated over a frame and a drag measured in pixels.
    const summed = sumIntents([demanding({ yaw: 0.2 }), demanding({ yaw: 0.05 })])
    expect(summed.yaw).toBeCloseTo(0.25, 12)
  })

  test('two techniques pushing opposite ways cancel', () => {
    expect(sumIntents([demanding({ advance: 1 }), demanding({ advance: -1 })]).advance).toBe(0)
  })

  test('movement is clamped, because it is a normalised demand', () => {
    // A stick and a key and a rope all asking to go forward is still forward,
    // not triple speed. The domain multiplies this by its own pace.
    const summed = sumIntents([
      demanding({ advance: 1 }),
      demanding({ advance: 1 }),
      demanding({ advance: 1 }),
    ])
    expect(summed.advance).toBe(1)
    expect(sumIntents([demanding({ strafe: -4 })]).strafe).toBe(-1)
  })

  test('turning is not clamped, because it is an absolute angle', () => {
    // Clamping radians would silently cap how far a fast drag may turn you.
    expect(sumIntents([demanding({ yaw: 3 }), demanding({ yaw: 3 })]).yaw).toBe(6)
  })

  test('an edge from any one technique fires the edge', () => {
    expect(sumIntents([NO_INTENTS, demanding({ act: true })]).act).toBe(true)
    expect(sumIntents([demanding({ leave: true }), NO_INTENTS]).leave).toBe(true)
  })

  test('summing does not modify what it was given', () => {
    const part = demanding({ advance: 1 })
    sumIntents([part, demanding({ advance: 1 })])
    expect(part.advance).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/intents.test.ts`
Expected: FAIL — cannot resolve `../../../src/space/intents`.

- [ ] **Step 3: Write the implementation**

Create `src/space/intents.ts`:

```ts
/**
 * What a visitor is asking for this frame, whatever they asked with.
 *
 * The whole vocabulary, deliberately small: a field added here is one that
 * every future domain is obliged to answer, so widening this is cheap and
 * shrinking it is not.
 */
export type IntentField = 'advance' | 'strafe' | 'yaw' | 'pitch' | 'act' | 'leave'

/**
 * A demand with a magnitude, not an event.
 *
 * Continuous domains integrate these over the frame; discrete ones latch or
 * threshold them. That is what lets a sphere, a corridor, a graph and a
 * carousel share one vocabulary.
 *
 * Movement is normalised and orientation is absolute, and the asymmetry is
 * meant: a step is radians of arc on a shell and metres of floor in a
 * corridor, so its scale belongs to the domain — while a turn is radians
 * everywhere.
 */
export type Intents = {
  /** Along the way the viewer faces, −1..1. Scaled by the domain's own pace. */
  advance: number
  /** Across it, −1..1. Scaled by the domain's own pace. */
  strafe: number
  /** Radians turned on the spot, positive to the right. */
  yaw: number
  /** Radians the head tilts back, positive upwards. */
  pitch: number
  /** Act on whatever is in front of the viewer. */
  act: boolean
  /** Leave the space entirely. */
  leave: boolean
}

export const NO_INTENTS: Intents = {
  advance: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  act: false,
  leave: false,
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

/**
 * Everything the active techniques asked for, as one demand.
 *
 * Techniques compose rather than take turns: keys, a pointer and a rope may
 * all be live, and whichever the visitor reaches for wins without a mode to
 * switch. Three of them asking to go forward is still forward, which is why
 * the normalised fields clamp after summing and the angles do not.
 */
export function sumIntents(parts: readonly Intents[]): Intents {
  let advance = 0
  let strafe = 0
  let yaw = 0
  let pitch = 0
  let act = false
  let leave = false

  for (const part of parts) {
    advance += part.advance
    strafe += part.strafe
    yaw += part.yaw
    pitch += part.pitch
    act ||= part.act
    leave ||= part.leave
  }

  return { advance: clampUnit(advance), strafe: clampUnit(strafe), yaw, pitch, act, leave }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/intents.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the module to the coverage allow-list**

In `vite.config.ts`, inside `test.coverage.include`, after the `'src/rooms/panels.ts',` line, add:

```ts
        // The navigation layer. Pure from the technique through to the pose;
        // only the rig and the fixtures touch the scene.
        'src/space/**/*.ts',
```

- [ ] **Step 6: Verify the whole suite and the build**

Run: `npm test && npm run build`
Expected: all tests pass; build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/space/intents.ts tests/unit/space/intents.test.ts vite.config.ts
git commit -m "feat: the intent vocabulary"
```

---

### Task 2: Pose

**Files:**
- Create: `src/space/pose.ts`
- Test: `tests/unit/space/pose.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Pose = { position: Vector3; orientation: Quaternion }`, `function orientationOf(facing: Vector3, up: Vector3): Quaternion`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/pose.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { orientationOf } from '../../../src/space/pose'

/** Where a camera holding `orientation` is looking, and which way its head is. */
const forwardOf = (orientation: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(orientation)
const upOf = (orientation: Quaternion) => new Vector3(0, 1, 0).applyQuaternion(orientation)

describe('an orientation built from a facing and an up', () => {
  test('looks the way it was told to face', () => {
    // A camera's forward is its own −Z. If this is backwards the whole room
    // renders behind the viewer, which is the least subtle bug available.
    const orientation = orientationOf(new Vector3(0, 0, -1), new Vector3(0, 1, 0))
    expect(forwardOf(orientation).distanceTo(new Vector3(0, 0, -1))).toBeCloseTo(0, 9)
  })

  test('keeps its head where it was told', () => {
    const orientation = orientationOf(new Vector3(1, 0, 0), new Vector3(0, 1, 0))
    expect(upOf(orientation).distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(0, 9)
  })

  test('works where up is not world up', () => {
    // The case the sphere room needs: standing inside a shell, up points at
    // the centre and is different at every point on the surface.
    const facing = new Vector3(0, 1, 0)
    const up = new Vector3(0, 0, -1)
    const orientation = orientationOf(facing, up)

    expect(forwardOf(orientation).distanceTo(facing)).toBeCloseTo(0, 9)
    expect(upOf(orientation).distanceTo(up)).toBeCloseTo(0, 9)
  })

  test('is unit length, so it never scales the scene', () => {
    const orientation = orientationOf(new Vector3(2, 3, -4), new Vector3(0, 5, 0))
    expect(orientation.length()).toBeCloseTo(1, 12)
  })

  test('does not modify the vectors it was given', () => {
    const facing = new Vector3(0, 0, -3)
    orientationOf(facing, new Vector3(0, 2, 0))
    expect(facing.z).toBe(-3)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/pose.test.ts`
Expected: FAIL — cannot resolve `../../../src/space/pose`.

- [ ] **Step 3: Write the implementation**

Create `src/space/pose.ts`:

```ts
import { Matrix4, Quaternion, Vector3 } from 'three'

/**
 * Where the viewer's body is, in the room's own render frame.
 *
 * The orientation is a quaternion rather than a heading angle, and the sphere
 * room settles it: standing on the inside of a shell, up points at the centre
 * and is therefore different at every point on the surface. A heading scalar
 * can express the corridor and the mountain but not that, and a pose type that
 * fits three rooms out of four is not a pose type.
 *
 * Head tilt is deliberately not in here. The rig applies it flat and drops it
 * in XR, where the neck owns it — and keeping it out means dropping it is not
 * a decomposition.
 */
export type Pose = {
  /** Where the eyes are. */
  position: Vector3
  /** Body orientation: facing and up together. */
  orientation: Quaternion
}

const ORIGIN = new Vector3(0, 0, 0)

/**
 * The orientation of a body facing `facing` with `up` over its head.
 *
 * `Matrix4.lookAt` builds a basis whose −Z points from the eye at the target,
 * which is the direction a camera looks, so passing the facing as the target
 * from the origin gives exactly the rotation wanted.
 */
export function orientationOf(facing: Vector3, up: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(ORIGIN, facing, up))
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/pose.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/space/pose.ts tests/unit/space/pose.test.ts
git commit -m "feat: a pose is a position and a full orientation"
```

---

### Task 3: The pointer gesture machine

Three gestures come off one pointer and must not be confused: a drag looks around, a still press walks, and a quick release acts. A phone has no other way to say all three.

**Files:**
- Create: `src/space/gesture.ts`
- Test: `tests/unit/space/gesture.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Press`, `type GestureState`, `type GestureOut`, `const SLOP_PX: number`, `const DWELL_MS: number`, `function idleGesture(): GestureState`, `function onPress(state: GestureState, press: Press): GestureOut`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/gesture.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  DWELL_MS,
  idleGesture,
  onPress,
  SLOP_PX,
  type GestureState,
  type Press,
} from '../../../src/space/gesture'

/** Feeds a whole press to the machine and hands back every frame's output. */
function play(presses: readonly Press[]) {
  let state: GestureState = idleGesture()
  return presses.map((press) => {
    const out = onPress(state, press)
    state = out.state
    return out
  })
}

describe('a press that travels', () => {
  test('is looking, and reports how far it moved since last time', () => {
    const [, moved] = play([
      { kind: 'down', x: 100, y: 100, at: 0 },
      { kind: 'move', x: 100 + SLOP_PX + 5, y: 130, at: 50 },
    ])

    expect(moved.dragged.dx).toBe(SLOP_PX + 5)
    expect(moved.dragged.dy).toBe(30)
    expect(moved.advancing).toBe(false)
  })

  test('stays looking even if it then holds still', () => {
    // A slow drag that pauses is still a drag. Promoting it to a walk would
    // start moving the viewer in the middle of them looking at something.
    const frames = play([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: 60, y: 0, at: 40 },
      { kind: 'tick', at: 40 + DWELL_MS * 3 },
    ])

    expect(frames.at(-1)!.advancing).toBe(false)
  })

  test('does not act when it ends', () => {
    const frames = play([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: 90, y: 0, at: 30 },
      { kind: 'up', at: 60 },
    ])

    expect(frames.at(-1)!.acted).toBe(false)
  })
})

describe('a press that stays put', () => {
  test('starts walking once it has been held past the dwell', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS - 1 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(frames[1].advancing).toBe(false)
    expect(frames[2].advancing).toBe(true)
  })

  test('keeps walking until it is released', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
      { kind: 'tick', at: DWELL_MS + 400 },
      { kind: 'up', at: DWELL_MS + 500 },
      { kind: 'tick', at: DWELL_MS + 600 },
    ])

    expect(frames[2].advancing).toBe(true)
    expect(frames.at(-1)!.advancing).toBe(false)
  })

  test('tolerates a finger that wobbles inside the slop', () => {
    // A finger never lands and holds on exactly one pixel.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'move', x: 10 + SLOP_PX - 1, y: 10, at: 20 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(frames.at(-1)!.advancing).toBe(true)
    expect(frames[1].dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('does not act when it is finally released', () => {
    // It walked. A walk that also opens something on release would mean you
    // cannot cross a room without pressing whatever you stopped in front of.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
      { kind: 'up', at: DWELL_MS + 200 },
    ])

    expect(frames.at(-1)!.acted).toBe(false)
  })
})

describe('a press that is over quickly', () => {
  test('acts, once, on release', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'up', at: DWELL_MS - 30 },
      { kind: 'tick', at: DWELL_MS + 200 },
    ])

    expect(frames[1].acted).toBe(true)
    expect(frames[2].acted).toBe(false)
  })

  test('a cancelled press acts on nothing', () => {
    // Pointer capture lost, a call arriving, a gesture the browser took over.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'cancel', at: 40 },
    ])

    expect(frames[1].acted).toBe(false)
    expect(frames[1].advancing).toBe(false)
  })
})

describe('the machine itself', () => {
  test('reports nothing at all when no press is in progress', () => {
    const out = onPress(idleGesture(), { kind: 'tick', at: 5000 })

    expect(out.advancing).toBe(false)
    expect(out.acted).toBe(false)
    expect(out.dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('ignores a move that arrives with no press behind it', () => {
    // A mouse crossing the window with no button down is not a drag.
    const out = onPress(idleGesture(), { kind: 'move', x: 500, y: 500, at: 10 })
    expect(out.dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('does not modify the state it was given', () => {
    const state = idleGesture()
    onPress(state, { kind: 'down', x: 1, y: 2, at: 0 })
    expect(state.origin).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/gesture.test.ts`
Expected: FAIL — cannot resolve `../../../src/space/gesture`.

- [ ] **Step 3: Write the implementation**

Create `src/space/gesture.ts`:

```ts
/**
 * How far a press may wander and still count as held rather than dragged.
 *
 * A finger never lands and holds on exactly one pixel, so a still press needs
 * tolerance; a drag must not be mistaken for one at any cost, because that
 * would start walking the viewer while they are looking at something.
 */
export const SLOP_PX = 10

/**
 * How long a press must be held still before it starts walking.
 *
 * Long enough that an ordinary tap finishes first — a tap has to be able to
 * act without the viewer taking a step on the way.
 */
export const DWELL_MS = 220

/** What the pointer did. `tick` is the frame passing with nothing happening. */
export type Press =
  | { kind: 'down'; x: number; y: number; at: number }
  | { kind: 'move'; x: number; y: number; at: number }
  | { kind: 'tick'; at: number }
  | { kind: 'up'; at: number }
  | { kind: 'cancel'; at: number }

/** What this press has turned out to be, once it is no longer in doubt. */
type Role = 'undecided' | 'look' | 'advance'

export type GestureState = {
  /** Where and when the press landed, or null between presses. */
  origin: { x: number; y: number; at: number } | null
  /** Where it was last seen, for measuring a frame's travel. */
  last: { x: number; y: number } | null
  role: Role
}

export type GestureOut = {
  state: GestureState
  /** Pixels travelled since the last sample. Zero unless this press is looking. */
  dragged: { dx: number; dy: number }
  /** True on every frame the press is walking the viewer. */
  advancing: boolean
  /** True on the one frame a press ended as a tap. */
  acted: boolean
}

const STILL = { dx: 0, dy: 0 } as const

export function idleGesture(): GestureState {
  return { origin: null, last: null, role: 'undecided' }
}

function out(
  state: GestureState,
  extra: Partial<Omit<GestureOut, 'state'>> = {},
): GestureOut {
  return { state, dragged: STILL, advancing: false, acted: false, ...extra }
}

/**
 * The gesture after one pointer event or one frame.
 *
 * Three gestures on one pointer, told apart by travel and by time: past the
 * slop it is looking, held still past the dwell it is walking, and over before
 * either it was a tap. A phone has no second button to say this with.
 *
 * Once a press has become a look it stays one, even if the finger then holds
 * still — a slow drag that pauses is still a drag.
 */
export function onPress(state: GestureState, press: Press): GestureOut {
  switch (press.kind) {
    case 'down':
      return out({
        origin: { x: press.x, y: press.y, at: press.at },
        last: { x: press.x, y: press.y },
        role: 'undecided',
      })

    case 'up':
      // A tap is a press that never became anything else.
      return out(idleGesture(), { acted: state.role === 'undecided' && state.origin !== null })

    case 'cancel':
      return out(idleGesture())

    case 'move': {
      if (!state.origin || !state.last) return out(state)

      const role =
        state.role === 'undecided' &&
        Math.hypot(press.x - state.origin.x, press.y - state.origin.y) > SLOP_PX
          ? 'look'
          : state.role

      const moved: GestureState = {
        origin: state.origin,
        last: { x: press.x, y: press.y },
        role,
      }

      if (role !== 'look') return out(moved)
      return out(moved, {
        dragged: { dx: press.x - state.last.x, dy: press.y - state.last.y },
      })
    }

    case 'tick': {
      if (!state.origin) return out(state)

      if (state.role === 'undecided' && press.at - state.origin.at > DWELL_MS) {
        return out({ ...state, role: 'advance' }, { advancing: true })
      }
      return out(state, { advancing: state.role === 'advance' })
    }
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/gesture.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Prove the test is not vacuous**

Change `SLOP_PX` from `10` to `10000` in `src/space/gesture.ts`.

Run: `npm run build` — **confirm it exits 0 first.** Then `npm test -- tests/unit/space/gesture.test.ts`.
Expected: FAIL on "is looking, and reports how far it moved since last time".

Put `SLOP_PX` back to `10` and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/space/gesture.ts tests/unit/space/gesture.test.ts
git commit -m "feat: tell a look, a walk and a tap apart on one pointer"
```

---

### Task 4: Techniques

**Files:**
- Create: `src/space/technique.ts`, `src/space/techniques/keys.ts`, `src/space/techniques/pointer.ts`
- Test: `tests/unit/space/techniques.test.ts`

**Interfaces:**
- Consumes: `Intents`, `NO_INTENTS`, `IntentField` (Task 1); `Press`, `GestureState`, `idleGesture`, `onPress`, `DWELL_MS`, `SLOP_PX` (Task 3); `Pose` (Task 2).
- Produces:
  - `type Signal = 'keys' | 'pointer' | 'hands' | 'gaze' | 'controllers'`
  - `type Signals = { keys: ReadonlySet<string>; presses: readonly Press[]; now: number }`
  - `interface Technique<S>` with `id`, `produces`, `requires`, `initial()`, `reduce(state, signals, seconds)`, optional `Fixture`
  - `function runTechniques(techniques, states, signals, seconds): { states: unknown[]; intents: Intents }`
  - `const keysTechnique: Technique<null>`
  - `const pointerTechnique: Technique<GestureState>`
  - `const LOOK_PER_PIXEL: number`, `const LOOK_PER_SECOND: number`

Note: the pointer's three gestures ship as **one** technique, not three. They share a single machine and are mutually exclusive on one pointer; splitting them would mean three copies of the same state. A room replacing pointer locomotion replaces this technique whole.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/techniques.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NO_INTENTS } from '../../../src/space/intents'
import { DWELL_MS, idleGesture, SLOP_PX, type Press } from '../../../src/space/gesture'
import { runTechniques, type Signals, type Technique } from '../../../src/space/technique'
import { keysTechnique, LOOK_PER_SECOND } from '../../../src/space/techniques/keys'
import { LOOK_PER_PIXEL, pointerTechnique } from '../../../src/space/techniques/pointer'

const signals = (part: Partial<Signals> = {}): Signals => ({
  keys: new Set<string>(),
  presses: [],
  now: 0,
  ...part,
})

const FRAME = 1 / 60

describe('the keyboard', () => {
  test('w and the up arrow both walk forward', () => {
    for (const key of ['w', 'arrowup']) {
      const { intents } = keysTechnique.reduce(null, signals({ keys: new Set([key]) }), FRAME)
      expect(intents.advance, key).toBe(1)
    }
  })

  test('forward and back at once is standing still', () => {
    const { intents } = keysTechnique.reduce(null, signals({ keys: new Set(['w', 's']) }), FRAME)
    expect(intents.advance).toBe(0)
  })

  test('walking is a normalised demand, not a distance', () => {
    // The domain owns the pace, because a step is radians of arc on a shell
    // and metres of floor in a corridor and one number cannot be both.
    const slow = keysTechnique.reduce(null, signals({ keys: new Set(['w']) }), FRAME)
    const long = keysTechnique.reduce(null, signals({ keys: new Set(['w']) }), FRAME * 10)
    expect(slow.intents.advance).toBe(long.intents.advance)
  })

  test('turning is radians, so it does depend on the frame', () => {
    const { intents } = keysTechnique.reduce(
      null,
      signals({ keys: new Set(['arrowright']) }),
      FRAME,
    )
    expect(intents.yaw).toBeCloseTo(LOOK_PER_SECOND * FRAME, 12)
  })

  test('a held key is matched however shift and caps lock left it', () => {
    // `event.key` for a letter is the letter typed, so the same physical key
    // arrives as `w` or `W`. A walk that stops when you hold shift is a bug
    // nobody thinks to look for.
    const { intents } = keysTechnique.reduce(null, signals({ keys: new Set(['W']) }), FRAME)
    expect(intents.advance).toBe(1)
  })

  test('escape asks to leave and space acts', () => {
    expect(keysTechnique.reduce(null, signals({ keys: new Set(['escape']) }), FRAME).intents.leave)
      .toBe(true)
    expect(keysTechnique.reduce(null, signals({ keys: new Set([' ']) }), FRAME).intents.act)
      .toBe(true)
  })

  test('nothing held asks for nothing', () => {
    expect(keysTechnique.reduce(null, signals(), FRAME).intents).toEqual(NO_INTENTS)
  })
})

describe('the pointer', () => {
  const press = (presses: Press[], seconds = FRAME) =>
    pointerTechnique.reduce(idleGesture(), signals({ presses }), seconds)

  test('a drag turns and tilts', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: SLOP_PX + 100, y: 40, at: 20 },
    ])

    // Dragging pulls the room past the viewer, the way dragging a panorama
    // does, so a drag to the left brings what was on the right to the front.
    expect(intents.yaw).toBeCloseTo(-(SLOP_PX + 100) * LOOK_PER_PIXEL, 9)
    expect(intents.pitch).toBeCloseTo(40 * LOOK_PER_PIXEL, 9)
    expect(intents.advance).toBe(0)
  })

  test('a held press walks, and asks for full speed', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(intents.advance).toBe(1)
    expect(intents.yaw).toBe(0)
  })

  test('a tap acts', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'up', at: 40 },
    ])

    expect(intents.act).toBe(true)
    expect(intents.advance).toBe(0)
  })

  test('it carries its gesture across frames', () => {
    // The dwell spans many frames, so the machine's state has to survive them.
    const first = pointerTechnique.reduce(
      idleGesture(),
      signals({ presses: [{ kind: 'down', x: 0, y: 0, at: 0 }] }),
      FRAME,
    )
    const later = pointerTechnique.reduce(
      first.state,
      signals({ presses: [{ kind: 'tick', at: DWELL_MS + 1 }] }),
      FRAME,
    )

    expect(later.intents.advance).toBe(1)
  })
})

describe('what a technique declares about itself', () => {
  test('the pointer alone can produce everything a phone needs to move', () => {
    for (const field of ['advance', 'yaw', 'pitch', 'act'] as const) {
      expect(pointerTechnique.produces).toContain(field)
    }
    expect(pointerTechnique.requires).toEqual(['pointer'])
  })

  test('the keyboard declares the keys it needs', () => {
    expect(keysTechnique.requires).toEqual(['keys'])
  })
})

describe('running several techniques together', () => {
  const still: Technique<null> = {
    id: 'still',
    produces: [],
    requires: [],
    initial: () => null,
    reduce: (state) => ({ state, intents: NO_INTENTS }),
  }

  test('their demands are summed, so no mode has to be switched', () => {
    const { intents } = runTechniques(
      [keysTechnique, pointerTechnique],
      [null, idleGesture()],
      signals({
        keys: new Set(['w']),
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'move', x: SLOP_PX + 60, y: 0, at: 10 },
        ],
      }),
      FRAME,
    )

    expect(intents.advance).toBe(1)
    expect(intents.yaw).toBeLessThan(0)
  })

  test('each technique gets its own state back, in order', () => {
    const { states } = runTechniques([still, keysTechnique], [null, null], signals(), FRAME)
    expect(states).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/techniques.test.ts`
Expected: FAIL — cannot resolve `../../../src/space/technique`.

- [ ] **Step 3: Write `src/space/technique.ts`**

```ts
import type { ComponentType } from 'react'
import type { Press } from './gesture'
import { sumIntents, type IntentField, type Intents } from './intents'
import type { Pose } from './pose'

/** A kind of raw input a device may or may not offer. */
export type Signal = 'keys' | 'pointer' | 'hands' | 'gaze' | 'controllers'

/** Everything raw that arrived this frame. */
export type Signals = {
  /** Keys currently down, lower-cased. */
  keys: ReadonlySet<string>
  /** Pointer events since the last frame, in order, ending with a tick. */
  presses: readonly Press[]
  /** Milliseconds, for anything measuring how long a thing has been held. */
  now: number
}

/**
 * A way of asking to move. The creative surface of this design.
 *
 * Not a fixed table of bindings: a technique may own state *and* geometry, so
 * pulling a rope along a corridor is expressible — there is a rope, it hangs
 * somewhere, you grip it, and the grip has an origin. `Fixture` is where the
 * rope is drawn and `reduce` is where the pull becomes a demand.
 *
 * Techniques compose. A room declares a list, their intents sum, and whichever
 * the visitor reaches for wins with no mode to switch. The shipped defaults
 * are ordinary entries in that list, not privileged ones.
 */
export interface Technique<S> {
  id: string
  /** Which fields this can emit. Read by the coverage check. */
  produces: readonly IntentField[]
  /** Which raw signals it cannot work without. */
  requires: readonly Signal[]
  initial(): S
  reduce(state: S, signals: Signals, seconds: number): { state: S; intents: Intents }
  /** What it draws, if it draws anything. */
  Fixture?: ComponentType<{ state: S; pose: Pose }>
}

/**
 * Every active technique advanced one frame, and everything they asked for.
 *
 * States are kept parallel to the technique list rather than keyed by id, so a
 * room may run the same technique twice — two ropes, one at each end — without
 * them sharing a grip.
 */
export function runTechniques(
  techniques: readonly Technique<unknown>[],
  states: readonly unknown[],
  signals: Signals,
  seconds: number,
): { states: unknown[]; intents: Intents } {
  const next: unknown[] = []
  const parts: Intents[] = []

  techniques.forEach((technique, index) => {
    const outcome = technique.reduce(states[index], signals, seconds)
    next.push(outcome.state)
    parts.push(outcome.intents)
  })

  return { states: next, intents: sumIntents(parts) }
}
```

**A note on `Technique<unknown>`.** `reduce` and `initial` are declared with
method syntax, which TypeScript compares bivariantly even under
`strictFunctionTypes`, so a `Technique<GestureState>` is assignable to
`Technique<unknown>` and a heterogeneous list type-checks. Writing them as
arrow properties instead would make the parameter position strictly
contravariant and the list would stop compiling — do not "tidy" them into
arrows.

- [ ] **Step 4: Write `src/space/techniques/keys.ts`**

```ts
import { NO_INTENTS, type Intents } from '../intents'
import type { Signals, Technique } from '../technique'

/** Radians turned or tilted per second while a look key is held. */
export const LOOK_PER_SECOND = 1.1

/** Whether any of `names` is down. */
function anyOf(keys: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => keys.has(name))
}

/** +1, −1 or 0, from which side is held. */
function axis(
  keys: ReadonlySet<string>,
  positive: readonly string[],
  negative: readonly string[],
): number {
  return (anyOf(keys, positive) ? 1 : 0) - (anyOf(keys, negative) ? 1 : 0)
}

/**
 * The bindings a first-person walker has always had.
 *
 * Arrows and WASD to go and to turn, page up and down for the head, space to
 * act and escape to leave — so a room's one indispensable move is reachable
 * without a mouse.
 *
 * Movement comes out normalised and turning comes out in radians: a step means
 * something different in every space and the domain scales it, while a turn
 * means radians everywhere.
 */
export const keysTechnique: Technique<null> = {
  id: 'keys',
  produces: ['advance', 'strafe', 'yaw', 'pitch', 'act', 'leave'],
  requires: ['keys'],
  initial: () => null,

  reduce(state, signals: Signals, seconds: number) {
    if (signals.keys.size === 0) return { state, intents: NO_INTENTS }

    // Lower-cased because `event.key` for a letter is the letter typed, so the
    // same physical key arrives as `w` or `W` depending on shift and caps lock.
    const keys = new Set([...signals.keys].map((key) => key.toLowerCase()))
    const turning = LOOK_PER_SECOND * seconds

    const intents: Intents = {
      advance: axis(keys, ['arrowup', 'w'], ['arrowdown', 's']),
      strafe: axis(keys, ['d'], ['a']),
      yaw: axis(keys, ['arrowright'], ['arrowleft']) * turning,
      pitch: axis(keys, ['pageup'], ['pagedown']) * turning,
      act: anyOf(keys, [' ', 'enter']),
      leave: keys.has('escape'),
    }

    return { state, intents }
  },
}
```

- [ ] **Step 5: Write `src/space/techniques/pointer.ts`**

```ts
import { idleGesture, onPress, type GestureState } from '../gesture'
import { NO_INTENTS, type Intents } from '../intents'
import type { Signals, Technique } from '../technique'

/** Radians of look per pixel of drag. Most of a right angle across a phone. */
export const LOOK_PER_PIXEL = 0.0032

/**
 * Looking, walking and acting, all off one pointer.
 *
 * The three gestures ship as one technique rather than three because they
 * share a single machine and are mutually exclusive on one pointer; three
 * techniques would be three copies of the same state disagreeing about what
 * the finger is doing. A room wanting different pointer locomotion replaces
 * this whole.
 *
 * Hold-to-go is the walk because it is the only gesture shape that survives
 * touch, hands and gaze unchanged, and it costs no screen in a room that is
 * the screen. An on-screen stick is a flat-web convention that dies on glasses.
 *
 * Drag pulls the room past the viewer rather than swinging their head: drag
 * left and what was on the right comes round to the front, drag down and the
 * ceiling comes into view. The same way round as a panorama, which is why
 * looking up is something a visitor discovers rather than has to be told.
 */
export const pointerTechnique: Technique<GestureState> = {
  id: 'pointer',
  produces: ['advance', 'yaw', 'pitch', 'act'],
  requires: ['pointer'],
  initial: idleGesture,

  reduce(state, signals: Signals) {
    let gesture = state
    const intents: Intents = { ...NO_INTENTS }

    for (const press of signals.presses) {
      const outcome = onPress(gesture, press)
      gesture = outcome.state

      intents.yaw -= outcome.dragged.dx * LOOK_PER_PIXEL
      intents.pitch += outcome.dragged.dy * LOOK_PER_PIXEL
      if (outcome.advancing) intents.advance = 1
      if (outcome.acted) intents.act = true
    }

    return { state: gesture, intents }
  },
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/techniques.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 7: Verify the build and commit**

```bash
npm run build
git add src/space/technique.ts src/space/techniques tests/unit/space/techniques.test.ts
git commit -m "feat: techniques, and the two that ship by default"
```

---

### Task 5: Domains and the coverage check

**Files:**
- Create: `src/space/domain.ts`, `src/space/coverage.ts`
- Test: `tests/unit/space/coverage.test.ts`

**Interfaces:**
- Consumes: `Intents`, `IntentField` (Task 1); `Pose` (Task 2); `Technique`, `Signal` (Task 4).
- Produces:
  - `interface Domain<State>` — `initial()`, `step(state, intents, seconds)`, `needs: readonly IntentField[]`
  - `interface Embodied<State> extends Domain<State>` — `poseOf(state)`, `pitchOf(state)`
  - `type Profile = { name: string; signals: readonly Signal[] }`
  - `const PROFILES: readonly Profile[]`
  - `function unreachableFields(needs, techniques, profile): IntentField[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/coverage.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { PROFILES, unreachableFields } from '../../../src/space/coverage'
import { NO_INTENTS } from '../../../src/space/intents'
import { keysTechnique } from '../../../src/space/techniques/keys'
import { pointerTechnique } from '../../../src/space/techniques/pointer'
import type { Technique } from '../../../src/space/technique'

describe('what a device can actually ask for', () => {
  const phone = PROFILES.find((profile) => profile.name === 'phone')!
  const desktop = PROFILES.find((profile) => profile.name === 'desktop')!

  test('a phone is a pointer and nothing else', () => {
    expect(phone.signals).toEqual(['pointer'])
  })

  test('a room needing only what the pointer offers is fine on a phone', () => {
    expect(
      unreachableFields(['advance', 'yaw', 'pitch'], [keysTechnique, pointerTechnique], phone),
    ).toEqual([])
  })

  test('a room needing to strafe is not, because no pointer gesture strafes', () => {
    // This is the guard rail. A room may not ship needing something the
    // device it is opened on has no way to say.
    expect(
      unreachableFields(['strafe'], [keysTechnique, pointerTechnique], phone),
    ).toEqual(['strafe'])
  })

  test('a technique whose signals the device lacks does not count', () => {
    // The exact shape of the live defect: walking was bound to keys only, and
    // a phone has no keys, so every room was a panorama viewer on touch.
    expect(unreachableFields(['advance'], [keysTechnique], phone)).toEqual(['advance'])
    expect(unreachableFields(['advance'], [keysTechnique], desktop)).toEqual([])
  })

  test('a room offering only an exotic technique fails on a plain desktop', () => {
    // The freedom to invent locomotion is the point, and this is what stops it
    // shipping a room that only a headset can walk in.
    const rope: Technique<null> = {
      id: 'rope',
      produces: ['advance'],
      requires: ['hands'],
      initial: () => null,
      reduce: (state) => ({ state, intents: NO_INTENTS }),
    }

    expect(unreachableFields(['advance'], [rope], desktop)).toEqual(['advance'])
  })

  test('needing nothing is always satisfiable', () => {
    expect(unreachableFields([], [], phone)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/coverage.test.ts`
Expected: FAIL — cannot resolve `../../../src/space/coverage`.

- [ ] **Step 3: Write `src/space/domain.ts`**

```ts
import type { IntentField, Intents } from './intents'
import type { Pose } from './pose'

/**
 * A space, and the rule for traversing it.
 *
 * `State` is opaque on purpose, and that is what admits spaces which are not
 * Euclidean: an atlas of charts for a portal space, an isometry for a
 * hyperbolic one, an index for a cycle.
 *
 * Motion is a transformation composed onto a state, never a delta added to a
 * position. For a Euclidean room the transformation is a translation, so
 * nothing is lost today — but a `Vector3` and addition would have excluded
 * hyperbolic, spherical, Sol and portal spaces outright rather than stylishly.
 */
export interface Domain<State> {
  initial(): State
  /**
   * The state `seconds` later, given what was asked for.
   *
   * `intents.advance` and `intents.strafe` arrive normalised: the domain owns
   * its own pace, because a step is radians of arc on a shell and metres of
   * floor in a corridor. `yaw` and `pitch` arrive as radians and are applied
   * as they are.
   */
  step(state: State, intents: Intents, seconds: number): State
  /** Fields without which this space cannot be used at all. */
  needs: readonly IntentField[]
}

/**
 * A domain that also puts a body somewhere: one you move *through*.
 *
 * The hub is the domain that is not this. A transformation changes the world
 * while the viewer holds still, so it has no pose to give and mounts no rig —
 * it takes only its input from this design.
 */
export interface Embodied<State> extends Domain<State> {
  poseOf(state: State): Pose
  /** Head tilt in radians. Applied by the rig flat, dropped in XR. */
  pitchOf(state: State): number
}
```

- [ ] **Step 4: Write `src/space/coverage.ts`**

```ts
import type { IntentField } from './intents'
import type { Signal, Technique } from './technique'

/** A class of device, described by what raw input it can offer. */
export type Profile = { name: string; signals: readonly Signal[] }

/**
 * The devices every room is required to work on.
 *
 * A phone is a pointer and nothing else, which is the whole reason this check
 * exists: walking used to be bound to held keys in every room, so on touch
 * all three were panorama viewers.
 */
export const PROFILES: readonly Profile[] = [
  { name: 'desktop', signals: ['keys', 'pointer'] },
  { name: 'phone', signals: ['pointer'] },
]

/**
 * The fields a domain needs that this device has no way to ask for.
 *
 * Empty is the only acceptable answer. A technique counts only if the profile
 * offers every signal it requires — a keyboard technique on a phone produces
 * nothing at all, however much it claims to produce.
 */
export function unreachableFields(
  needs: readonly IntentField[],
  techniques: readonly Technique<unknown>[],
  profile: Profile,
): IntentField[] {
  const usable = techniques.filter((technique) =>
    technique.requires.every((signal) => profile.signals.includes(signal)),
  )
  const available = new Set(usable.flatMap((technique) => [...technique.produces]))

  return needs.filter((field) => !available.has(field))
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/coverage.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify the build and commit**

```bash
npm run build
git add src/space/domain.ts src/space/coverage.ts tests/unit/space/coverage.test.ts
git commit -m "feat: the domain interface, and the check that keeps phones moving"
```

---

### Task 6: The shell domain (SVR)

**Files:**
- Create: `src/space/domains/shell.ts`
- Test: `tests/unit/space/domains/shell.test.ts`

**Interfaces:**
- Consumes: `Embodied` (Task 5), `orientationOf`, `Pose` (Task 2), `Intents`, `NO_INTENTS` (Task 1); and, unchanged, `initialStance`, `walk`, `turn`, `eyeAt`, `upAt`, `facingAt`, `type Stance` from `src/rooms/svr/walk.ts` plus `clampPitch`, `gazeAt`, `headUpAt` from `src/rooms/svr/gaze.ts`.
- Produces: `type ShellState = { stance: Stance; pitch: number }`, `const ARC_PER_SECOND: number`, `function shellDomain(radius: number, eyeHeight: number): Embodied<ShellState>`.

A factory rather than a constant, because the radius and eye height are the room's, not the domain's.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/domains/shell.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { ARC_PER_SECOND, shellDomain } from '../../../../src/space/domains/shell'
import { eyeAt, facingAt, upAt } from '../../../../src/rooms/svr/walk'
import { gazeAt, headUpAt, MAX_PITCH } from '../../../../src/rooms/svr/gaze'

const RADIUS = 9
const EYE_HEIGHT = 1.65
const shell = shellDomain(RADIUS, EYE_HEIGHT)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

/** Where a camera holding `orientation`, tilted by `pitch`, is looking. */
function looking(orientation: Quaternion, pitch: number): Vector3 {
  const tilted = orientation
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
  return new Vector3(0, 0, -1).applyQuaternion(tilted)
}

describe('walking the inside of a shell', () => {
  test('opens standing still', () => {
    const state = shell.initial()
    expect(state.pitch).toBe(0)
    expect(shell.step(state, NO_INTENTS, 1 / 60)).toEqual(state)
  })

  test('a full second of forward is one second of arc', () => {
    // The domain owns the pace. The technique only said "forward, fully".
    const walked = shell.step(shell.initial(), asking({ advance: 1 }), 1)
    const travelled = eyeAt(walked.stance, RADIUS).angleTo(eyeAt(shell.initial().stance, RADIUS))

    expect(travelled).toBeCloseTo(ARC_PER_SECOND, 6)
  })

  test('half the demand is half the arc', () => {
    const half = shell.step(shell.initial(), asking({ advance: 0.5 }), 1)
    const travelled = eyeAt(half.stance, RADIUS).angleTo(eyeAt(shell.initial().stance, RADIUS))

    expect(travelled).toBeCloseTo(ARC_PER_SECOND / 2, 6)
  })

  test('turning is applied as the radians it already is', () => {
    const turned = shell.step(shell.initial(), asking({ yaw: 0.4 }), 1 / 60)
    expect(facingAt(turned.stance).angleTo(facingAt(shell.initial().stance))).toBeCloseTo(0.4, 6)
  })

  test('turning on the spot does not move the feet', () => {
    const turned = shell.step(shell.initial(), asking({ yaw: 1.2 }), 1 / 60)
    expect(eyeAt(turned.stance, RADIUS).distanceTo(eyeAt(shell.initial().stance, RADIUS)))
      .toBeCloseTo(0, 9)
  })

  test('the head can only tilt so far back', () => {
    let state = shell.initial()
    for (let frame = 0; frame < 200; frame++) state = shell.step(state, asking({ pitch: 0.1 }), 1 / 60)

    expect(shell.pitchOf(state)).toBeCloseTo(MAX_PITCH, 9)
  })

  test('it never modifies the state it was given', () => {
    const state = shell.initial()
    const before = eyeAt(state.stance, RADIUS)
    shell.step(state, asking({ advance: 1, yaw: 1 }), 1)

    expect(eyeAt(state.stance, RADIUS).distanceTo(before)).toBe(0)
  })
})

describe('the pose it hands the rig', () => {
  test('puts the eyes a head below the shell', () => {
    expect(shell.poseOf(shell.initial()).position.length()).toBeCloseTo(RADIUS - EYE_HEIGHT, 6)
  })

  test('agrees with the room optics it replaces', () => {
    // The rig applies pitch as a local rotation about +X. This asserts that is
    // the same thing gazeAt and headUpAt were computing, at every tilt and
    // after walking somewhere up is nowhere near world up. Get the axis or its
    // sign wrong and looking up looks down.
    let state = shell.step(shell.initial(), { ...NO_INTENTS, advance: 1, strafe: 0.4 }, 1)
    state = shell.step(state, { ...NO_INTENTS, yaw: 0.9 }, 1 / 60)

    for (const pitch of [-MAX_PITCH, -0.7, 0, 0.35, MAX_PITCH]) {
      const orientation = shell.poseOf({ ...state, pitch }).orientation
      expect(looking(orientation, pitch).distanceTo(gazeAt(state.stance, pitch)), `pitch ${pitch}`)
        .toBeCloseTo(0, 6)

      const up = new Vector3(0, 1, 0).applyQuaternion(
        orientation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch)),
      )
      expect(up.distanceTo(headUpAt(state.stance, pitch)), `up at pitch ${pitch}`).toBeCloseTo(0, 6)
    }
  })

  test('its up points at the centre of the room, not at world up', () => {
    const state = shell.step(shell.initial(), { ...NO_INTENTS, advance: 1 }, 1.4)
    const up = new Vector3(0, 1, 0).applyQuaternion(shell.poseOf(state).orientation)

    expect(up.distanceTo(upAt(state.stance))).toBeCloseTo(0, 6)
    expect(up.distanceTo(new Vector3(0, 1, 0))).toBeGreaterThan(0.2)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to walk, turn and look up', () => {
    // Looking up is not optional here: the thing the room is about hangs at
    // the centre, over the viewer's head.
    expect([...shell.needs].sort()).toEqual(['advance', 'pitch', 'yaw'])
  })

  test('it does not need to strafe', () => {
    expect(shell.needs).not.toContain('strafe')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/domains/shell.test.ts`
Expected: FAIL — cannot resolve `../../../../src/space/domains/shell`.

- [ ] **Step 3: Write the implementation**

Create `src/space/domains/shell.ts`:

```ts
import { clampPitch } from '../../rooms/svr/gaze'
import { eyeAt, facingAt, initialStance, turn, upAt, walk, type Stance } from '../../rooms/svr/walk'
import type { Embodied } from '../domain'
import type { Intents } from '../intents'
import { orientationOf, type Pose } from '../pose'

/**
 * Radians of arc walked per second at full demand.
 *
 * Arc, not metres: this is the pace of a space measured in angles, and it is
 * the domain's to own for exactly that reason.
 */
export const ARC_PER_SECOND = 0.85

export type ShellState = {
  stance: Stance
  /** How far back the head is tilted. Kept apart from the stance so that
   *  walking carries the head with it and looking up moves nothing else. */
  pitch: number
}

/**
 * The inside of a sphere, walked.
 *
 * The stance is an orientation rather than a latitude and longitude because up
 * points at the centre and is different at every point; two angles would
 * gimbal-lock at the poles. Walking is a rotation composed onto the one the
 * viewer already has — motion as a transformation, which is what the interface
 * is shaped for.
 */
export function shellDomain(radius: number, eyeHeight: number): Embodied<ShellState> {
  return {
    needs: ['advance', 'yaw', 'pitch'],

    initial: (): ShellState => ({ stance: initialStance(), pitch: 0 }),

    step(state: ShellState, intents: Intents, seconds: number): ShellState {
      const arc = ARC_PER_SECOND * seconds
      const forward = intents.advance * arc
      const sideways = intents.strafe * arc

      let stance = state.stance
      if (forward !== 0 || sideways !== 0) stance = walk(stance, { forward, sideways })
      if (intents.yaw !== 0) stance = turn(stance, intents.yaw)

      return { stance, pitch: clampPitch(state.pitch + intents.pitch) }
    },

    poseOf: (state: ShellState): Pose => ({
      position: eyeAt(state.stance, radius - eyeHeight),
      orientation: orientationOf(facingAt(state.stance), upAt(state.stance)),
    }),

    pitchOf: (state: ShellState) => state.pitch,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/domains/shell.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Prove the equivalence test is not vacuous**

In `src/space/domains/shell.ts`, swap the two arguments to `orientationOf` so it reads `orientationOf(upAt(state.stance), facingAt(state.stance))`.

Run `npm run build` — **confirm it exits 0** — then `npm test -- tests/unit/space/domains/shell.test.ts`.
Expected: FAIL on "agrees with the room optics it replaces".

Restore the correct order and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/space/domains/shell.ts tests/unit/space/domains/shell.test.ts
git commit -m "feat: the shell domain, proved against the room's own optics"
```

---

### Task 7: The corridor domain (papercup)

**Files:**
- Create: `src/space/domains/corridor.ts`
- Test: `tests/unit/space/domains/corridor.test.ts`

**Interfaces:**
- Consumes: `Embodied` (Task 5), `orientationOf` (Task 2); and, unchanged, `strollTo`, `facingOf`, `type Bounds`, `type Stroll` from `src/rooms/papercup/stroll.ts`, plus `clampPitch` from `src/rooms/svr/gaze.ts`.
- Produces: `type CorridorState = { stroll: Stroll; pitch: number }`, `const METRES_PER_SECOND: number`, `function corridorDomain(bounds: Bounds, start: { x: number; z: number; heading: number }, eyeHeight: number): Embodied<CorridorState>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/domains/corridor.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { corridorDomain, METRES_PER_SECOND } from '../../../../src/space/domains/corridor'
import type { Bounds } from '../../../../src/rooms/papercup/stroll'

const ROOM: Bounds = { alongString: 8.2, acrossString: 2 }
const START = { x: -6.5, z: 1.2, heading: -0.1 }
const EYE_HEIGHT = 1.62
const corridor = corridorDomain(ROOM, START, EYE_HEIGHT)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('walking a corridor', () => {
  test('opens where the room said to arrive', () => {
    const pose = corridor.poseOf(corridor.initial())
    expect(pose.position.x).toBeCloseTo(START.x, 9)
    expect(pose.position.z).toBeCloseTo(START.z, 9)
  })

  test('the eyes are a head above the floor', () => {
    expect(corridor.poseOf(corridor.initial()).position.y).toBeCloseTo(EYE_HEIGHT, 9)
  })

  test('a full second of forward is metres, not radians', () => {
    // The same demand the shell reads as arc. That is the point of normalising.
    const walked = corridor.step(corridor.initial(), asking({ advance: 1 }), 1)
    const travelled = walked.stroll.position.distanceTo(corridor.initial().stroll.position)

    expect(travelled).toBeCloseTo(METRES_PER_SECOND, 6)
  })

  test('the walls stop the viewer', () => {
    let state = corridor.initial()
    for (let frame = 0; frame < 600; frame++) state = corridor.step(state, asking({ advance: 1 }), 1 / 60)

    expect(Math.abs(state.stroll.position.x)).toBeLessThanOrEqual(ROOM.alongString)
    expect(Math.abs(state.stroll.position.z)).toBeLessThanOrEqual(ROOM.acrossString)
  })

  test('walking into a wall at an angle slides along it', () => {
    // Being stuck square-on to a wall is how a room stops feeling like a room.
    let state = corridor.step(corridor.initial(), asking({ yaw: 0.6 }), 1 / 60)
    const before = state.stroll.position.clone()
    for (let frame = 0; frame < 600; frame++) state = corridor.step(state, asking({ advance: 1 }), 1 / 60)

    expect(state.stroll.position.distanceTo(before)).toBeGreaterThan(1)
  })

  test('a turn moves the view and not the feet', () => {
    const turned = corridor.step(corridor.initial(), asking({ yaw: 0.8 }), 1 / 60)
    expect(turned.stroll.position.distanceTo(corridor.initial().stroll.position)).toBeCloseTo(0, 12)
  })

  test('it never modifies the state it was given', () => {
    const state = corridor.initial()
    const before = state.stroll.position.clone()
    corridor.step(state, asking({ advance: 1, strafe: 1 }), 1)

    expect(state.stroll.position.distanceTo(before)).toBe(0)
  })
})

describe('the pose it hands the rig', () => {
  test('faces the way the viewer is turned', () => {
    const state = corridor.step(corridor.initial(), asking({ yaw: 0.5 }), 1 / 60)
    const forward = new Vector3(0, 0, -1).applyQuaternion(corridor.poseOf(state).orientation)
    const facing = new Vector3(
      Math.cos(state.stroll.heading),
      0,
      Math.sin(state.stroll.heading),
    )

    expect(forward.distanceTo(facing)).toBeCloseTo(0, 6)
  })

  test('keeps its head on world up, because the floor is flat', () => {
    const state = corridor.step(corridor.initial(), asking({ yaw: 2.2 }), 1 / 60)
    const up = new Vector3(0, 1, 0).applyQuaternion(corridor.poseOf(state).orientation)

    expect(up.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(0, 6)
  })

  test('a drag right brings what was on the right to the front', () => {
    // The corridor's heading runs the opposite way round the floor from the
    // shell's sense of a turn. Same gesture, and it must move both rooms the
    // same way — this is the test that catches the sign being dropped.
    const turned = corridor.step(corridor.initial(), asking({ yaw: 0.3 }), 1 / 60)
    const before = new Vector3(0, 0, -1).applyQuaternion(corridor.poseOf(corridor.initial()).orientation)
    const after = new Vector3(0, 0, -1).applyQuaternion(corridor.poseOf(turned).orientation)

    // Turning right rotates the facing clockwise seen from above: its cross
    // product with world up swings the same way the shell's does.
    expect(new Vector3().crossVectors(before, after).y).toBeLessThan(0)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to walk and to turn', () => {
    expect(corridor.needs).toContain('advance')
    expect(corridor.needs).toContain('yaw')
  })

  test('it does not need to strafe', () => {
    expect(corridor.needs).not.toContain('strafe')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/domains/corridor.test.ts`
Expected: FAIL — cannot resolve `../../../../src/space/domains/corridor`.

- [ ] **Step 3: Write the implementation**

Create `src/space/domains/corridor.ts`:

```ts
import { Vector3 } from 'three'
import { clampPitch } from '../../rooms/svr/gaze'
import { facingOf, strollTo, type Bounds, type Stroll } from '../../rooms/papercup/stroll'
import type { Embodied } from '../domain'
import type { Intents } from '../intents'
import { orientationOf, type Pose } from '../pose'

/** Metres a second on foot at full demand. A walk, not a run. */
export const METRES_PER_SECOND = 3.4

export type CorridorState = {
  stroll: Stroll
  pitch: number
}

const WORLD_UP = new Vector3(0, 1, 0)

/**
 * A flat floor between walls, walked.
 *
 * A heading rather than a full orientation, because the floor is level and a
 * viewer has one angle to turn through with no way to end up tipped over —
 * the whole difference from the shell next door.
 *
 * The turn is negated against the intent. A positive yaw is a turn to the
 * right in every space; here the heading is measured the other way round the
 * floor, so the same gesture has to arrive with its sign flipped to move this
 * room the same way it moves the sphere.
 */
export function corridorDomain(
  bounds: Bounds,
  start: { x: number; z: number; heading: number },
  eyeHeight: number,
): Embodied<CorridorState> {
  return {
    needs: ['advance', 'yaw', 'pitch'],

    initial: (): CorridorState => ({
      stroll: { position: new Vector3(start.x, 0, start.z), heading: start.heading },
      pitch: 0,
    }),

    step(state: CorridorState, intents: Intents, seconds: number): CorridorState {
      const metres = METRES_PER_SECOND * seconds

      return {
        stroll: strollTo(
          state.stroll,
          {
            forward: intents.advance * metres,
            sideways: intents.strafe * metres,
            turned: -intents.yaw,
          },
          bounds,
        ),
        pitch: clampPitch(state.pitch + intents.pitch),
      }
    },

    poseOf: (state: CorridorState): Pose => ({
      position: new Vector3(state.stroll.position.x, eyeHeight, state.stroll.position.z),
      orientation: orientationOf(facingOf(state.stroll), WORLD_UP),
    }),

    pitchOf: (state: CorridorState) => state.pitch,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/domains/corridor.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify the build and commit**

```bash
npm run build
git add src/space/domains/corridor.ts tests/unit/space/domains/corridor.test.ts
git commit -m "feat: the corridor domain"
```

---

### Task 8: The mountain domain (open-ski-data)

The mountain is where the vocabulary earns itself: `yaw` thresholds into choosing an outgoing link and `advance` latches into departing. Those are the controls already shipped, arrived at from the interface rather than designed twice.

The eased look direction currently lives as a `useRef` inside `MountainRoom` and is therefore untestable. It moves into the domain state here.

**Files:**
- Create: `src/space/domains/mountain.ts`
- Test: `tests/unit/space/domains/mountain.test.ts`

**Interfaces:**
- Consumes: `Embodied` (Task 5), `orientationOf` (Task 2); and, unchanged, `startAt`, `look`, `depart`, `advance as advanceJourney`, `positionOf`, `focusOf`, `pointedAt`, `type Journey` from `src/rooms/openSkiData/travel.ts`, plus `type Resort` from `src/rooms/openSkiData/resort.ts`.
- Produces: `type MountainState = { journey: Journey; aim: Vector3; pitch: number; turned: number }`, `const CHOICE_THRESHOLD: number`, `const DEPART_THRESHOLD: number`, `const EASE: number`, `function mountainDomain(resort: Resort, arrival: string, eyeHeight: number, arrivalTilt: number): Embodied<MountainState>`.

`turned` accumulates yaw so that a slow drag eventually crosses the threshold rather than being discarded every frame.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/domains/mountain.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import {
  CHOICE_THRESHOLD,
  DEPART_THRESHOLD,
  mountainDomain,
} from '../../../../src/space/domains/mountain'
import { resort } from '../../../../src/rooms/openSkiData/resort'
import { pointedAt } from '../../../../src/rooms/openSkiData/travel'

const REGISTRY = resort()
const ARRIVAL = 'base'
const mountain = mountainDomain(REGISTRY, ARRIVAL, 1.7, -0.24)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

/** Feeds one intent for as many frames as it takes, or gives up. */
function hold(state: ReturnType<typeof mountain.initial>, intents: Intents, frames: number) {
  let carried = state
  for (let frame = 0; frame < frames; frame++) carried = mountain.step(carried, intents, 1 / 60)
  return carried
}

describe('standing at a place', () => {
  test('opens at the arrival, pointed at something', () => {
    const state = mountain.initial()
    expect(state.journey).toEqual({ at: 'place', place: ARRIVAL, choice: 0 })
    expect(pointedAt(REGISTRY, state.journey)).toBeDefined()
  })

  test('a small turn does not change the choice', () => {
    // Otherwise the choice flickers through every link as you look around.
    const nudged = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD / 4 }), 1 / 60)
    expect(nudged.journey).toEqual(mountain.initial().journey)
  })

  test('turning far enough steps to the next link', () => {
    const stepped = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD * 1.1 }), 1 / 60)
    expect(stepped.journey).not.toEqual(mountain.initial().journey)
    expect(pointedAt(REGISTRY, stepped.journey)).not.toEqual(pointedAt(REGISTRY, mountain.initial().journey))
  })

  test('a slow turn accumulates instead of being thrown away', () => {
    // A drag delivers a few hundredths of a radian per frame. Discarding each
    // one would make the mountain unusable with a finger.
    const crept = hold(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD / 8 }), 10)
    expect(pointedAt(REGISTRY, crept.journey)).not.toEqual(
      pointedAt(REGISTRY, mountain.initial().journey),
    )
  })

  test('turning back and forth ends up where it started', () => {
    const there = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD * 1.1 }), 1 / 60)
    const back = mountain.step(there, asking({ yaw: -CHOICE_THRESHOLD * 1.1 }), 1 / 60)
    expect(back.journey).toEqual(mountain.initial().journey)
  })
})

describe('departing', () => {
  test('a firm advance sets off along the chosen link', () => {
    const gone = mountain.step(mountain.initial(), asking({ advance: DEPART_THRESHOLD + 0.1 }), 1 / 60)
    expect(gone.journey.at).toBe('link')
  })

  test('a feather-light advance does not', () => {
    const stayed = mountain.step(mountain.initial(), asking({ advance: DEPART_THRESHOLD / 2 }), 1 / 60)
    expect(stayed.journey.at).toBe('place')
  })

  test('the ride cannot be got off halfway', () => {
    // You cannot get off a chairlift in the middle, and pretending otherwise
    // would make the graph decorative rather than the thing being travelled.
    let state = mountain.step(mountain.initial(), asking({ advance: 1 }), 1 / 60)
    const link = state.journey.at === 'link' ? state.journey.link : undefined
    state = hold(state, asking({ yaw: CHOICE_THRESHOLD * 4 }), 3)

    expect(state.journey.at).toBe('link')
    expect(state.journey.at === 'link' ? state.journey.link : undefined).toEqual(link)
  })

  test('riding long enough arrives somewhere else', () => {
    let state = mountain.step(mountain.initial(), asking({ advance: 1 }), 1 / 60)
    state = hold(state, NO_INTENTS, 60 * 30)

    expect(state.journey.at).toBe('place')
    expect(state.journey.at === 'place' ? state.journey.place : '').not.toBe(ARRIVAL)
  })

  test('an unsurveyed link refuses to be departed', () => {
    // The room's whole argument: the data does not exist, so neither does the
    // way through. Started at the bowl, whose one outgoing link is the
    // unsurveyed couloir — `linksFrom` is directional, so nothing unsurveyed
    // leaves the base.
    const bowl = mountainDomain(REGISTRY, 'bowl', 1.7, -0.24)
    const state = bowl.initial()

    expect(pointedAt(REGISTRY, state.journey)?.kind, 'the fixture changed').toBe('unsurveyed')
    expect(bowl.step(state, asking({ advance: 1 }), 1 / 60).journey.at).toBe('place')
  })
})

describe('the pose it hands the rig', () => {
  test('puts the eyes above the place being stood at', () => {
    expect(mountain.poseOf(mountain.initial()).position.y).toBeGreaterThan(0)
  })

  test('settles rather than snapping when the choice changes', () => {
    // The eased aim used to live in the component and could not be tested.
    const stepped = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD * 1.1 }), 1 / 60)
    const settled = hold(stepped, NO_INTENTS, 120)

    expect(stepped.aim.distanceTo(settled.aim)).toBeGreaterThan(0.01)
  })

  test('it never modifies the state it was given', () => {
    const state = mountain.initial()
    const before = state.aim.clone()
    mountain.step(state, asking({ advance: 1, yaw: 1 }), 1 / 60)

    expect(state.aim.distanceTo(before)).toBe(0)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to choose and to go', () => {
    expect(mountain.needs).toContain('advance')
    expect(mountain.needs).toContain('yaw')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/domains/mountain.test.ts`
Expected: FAIL — cannot resolve `../../../../src/space/domains/mountain`.

- [ ] **Step 3: Write the implementation**

Create `src/space/domains/mountain.ts`:

```ts
import { Vector3 } from 'three'
import { clampPitch } from '../../rooms/svr/gaze'
import type { Resort } from '../../rooms/openSkiData/resort'
import {
  advance as advanceJourney,
  depart,
  focusOf,
  look,
  positionOf,
  startAt,
  type Journey,
} from '../../rooms/openSkiData/travel'
import type { Embodied } from '../domain'
import type { Intents } from '../intents'
import { orientationOf, type Pose } from '../pose'

/**
 * Radians of turn that add up to one step through the choices.
 *
 * Accumulated rather than tested per frame, because a drag delivers a few
 * hundredths of a radian at a time and discarding each one would leave the
 * mountain unusable with a finger.
 */
export const CHOICE_THRESHOLD = 0.35

/** How hard `advance` must be asked for before it counts as setting off. */
export const DEPART_THRESHOLD = 0.5

/** How quickly the view settles onto whatever is being looked at. */
export const EASE = 4.5

const WORLD_UP = new Vector3(0, 1, 0)

export type MountainState = {
  journey: Journey
  /** The direction the view has settled to, which lags the journey's own. */
  aim: Vector3
  pitch: number
  /** Turn banked up but not yet spent on a step through the choices. */
  turned: number
}

/**
 * A resort as its own graph, travelled.
 *
 * One-dimensional and discrete: there is no forward here, only which edge you
 * are pointed at and whether you are going. `yaw` thresholds into the choice
 * and `advance` latches into departing — the same two fields the shell reads
 * as a geodesic, resolving against a different mathematics.
 */
export function mountainDomain(
  registry: Resort,
  arrival: string,
  eyeHeight: number,
  arrivalTilt: number,
): Embodied<MountainState> {
  /** Where the view wants to be pointed, from wherever the journey has got to. */
  function wants(journey: Journey): Vector3 {
    const from = positionOf(registry, journey)
    return focusOf(registry, journey).sub(from).normalize()
  }

  const opening = startAt(arrival)

  return {
    needs: ['advance', 'yaw'],

    initial: (): MountainState => ({
      journey: opening,
      aim: wants(opening),
      pitch: arrivalTilt,
      turned: 0,
    }),

    step(state: MountainState, intents: Intents, seconds: number): MountainState {
      let journey = state.journey
      let turned = state.turned + intents.yaw

      // Standing still, a turn picks; moving, it is banked and nothing happens,
      // because you cannot get off a chairlift halfway.
      if (journey.at === 'place') {
        while (Math.abs(turned) >= CHOICE_THRESHOLD) {
          const step = Math.sign(turned)
          journey = look(registry, journey, step)
          turned -= step * CHOICE_THRESHOLD
        }
        if (intents.advance >= DEPART_THRESHOLD) journey = depart(registry, journey)
      } else {
        turned = 0
        journey = advanceJourney(registry, journey, seconds)
      }

      return {
        journey,
        aim: state.aim.clone().lerp(wants(journey), Math.min(1, EASE * seconds)).normalize(),
        pitch: clampPitch(state.pitch + intents.pitch),
        turned,
      }
    },

    poseOf: (state: MountainState): Pose => {
      const feet = positionOf(registry, state.journey)
      return {
        position: new Vector3(feet.x, feet.y + eyeHeight, feet.z),
        orientation: orientationOf(state.aim, WORLD_UP),
      }
    },

    pitchOf: (state: MountainState) => state.pitch,
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/domains/mountain.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Prove the departure test is not vacuous**

In `src/space/domains/mountain.ts`, change `if (intents.advance >= DEPART_THRESHOLD) journey = depart(registry, journey)` to `if (false) journey = depart(registry, journey)`.

Run `npm run build` first. If it fails on the unused-condition lint or a type error, fix the mutation so it type-checks — **a mutation whose build aborted has not reached anything and proves nothing.** Then run the test.
Expected: FAIL on "a firm advance sets off along the chosen link".

Restore and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/space/domains/mountain.ts tests/unit/space/domains/mountain.test.ts
git commit -m "feat: the mountain domain, where a turn is a choice"
```

---

### Task 9: The cycle domain (the hub)

**Files:**
- Create: `src/space/domains/cycle.ts`
- Test: `tests/unit/space/domains/cycle.test.ts`

**Interfaces:**
- Consumes: `Domain` (Task 5), `Intents` (Task 1).
- Produces: `type CycleState = { index: number; turned: number; chosen: boolean }`, `const STEP_THRESHOLD: number`, `function cycleDomain(count: number): Domain<CycleState>`.

`Domain` and not `Embodied`: a transformation changes the world while the viewer holds still, so there is no pose and no rig.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/space/domains/cycle.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { cycleDomain, STEP_THRESHOLD } from '../../../../src/space/domains/cycle'

const cycle = cycleDomain(5)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('stepping a ring of things', () => {
  test('opens on the first', () => {
    expect(cycle.initial().index).toBe(0)
    expect(cycle.initial().chosen).toBe(false)
  })

  test('a turn to the right steps forward', () => {
    expect(cycle.step(cycle.initial(), asking({ yaw: STEP_THRESHOLD }), 1 / 60).index).toBe(1)
  })

  test('a turn to the left steps back, wrapping', () => {
    // Wrapping in both directions, so there is no dead end at either end.
    expect(cycle.step(cycle.initial(), asking({ yaw: -STEP_THRESHOLD }), 1 / 60).index).toBe(4)
  })

  test('a small turn does nothing yet, but is not thrown away', () => {
    const nudged = cycle.step(cycle.initial(), asking({ yaw: STEP_THRESHOLD / 3 }), 1 / 60)
    expect(nudged.index).toBe(0)

    const again = cycle.step(nudged, asking({ yaw: STEP_THRESHOLD / 3 }), 1 / 60)
    const third = cycle.step(again, asking({ yaw: STEP_THRESHOLD / 3 }), 1 / 60)
    expect(third.index).toBe(1)
  })

  test('going all the way round returns to the start', () => {
    let state = cycle.initial()
    for (let step = 0; step < 5; step++) state = cycle.step(state, asking({ yaw: STEP_THRESHOLD }), 1 / 60)
    expect(state.index).toBe(0)
  })

  test('acting chooses whatever is in front', () => {
    expect(cycle.step(cycle.initial(), asking({ act: true }), 1 / 60).chosen).toBe(true)
  })

  test('once chosen it stops stepping', () => {
    // The shape is supposed to be the posture it was caught in, so a step
    // during the focus beat would start a morph out of the very posture being
    // frozen.
    const chosen = cycle.step(cycle.initial(), asking({ act: true }), 1 / 60)
    expect(cycle.step(chosen, asking({ yaw: STEP_THRESHOLD * 3 }), 1 / 60).index).toBe(chosen.index)
  })

  test('one thing on the ring cannot be stepped off', () => {
    const alone = cycleDomain(1)
    expect(alone.step(alone.initial(), asking({ yaw: STEP_THRESHOLD * 4 }), 1 / 60).index).toBe(0)
  })

  test('it never modifies the state it was given', () => {
    const state = cycle.initial()
    cycle.step(state, asking({ yaw: STEP_THRESHOLD * 2, act: true }), 1 / 60)
    expect(state).toEqual({ index: 0, turned: 0, chosen: false })
  })
})

describe('what it needs to be usable', () => {
  test('it needs to browse and to enter', () => {
    expect(cycle.needs).toContain('yaw')
    expect(cycle.needs).toContain('act')
  })

  test('it does not need to advance, because nobody goes anywhere', () => {
    expect(cycle.needs).not.toContain('advance')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test -- tests/unit/space/domains/cycle.test.ts`
Expected: FAIL — cannot resolve `../../../../src/space/domains/cycle`.

- [ ] **Step 3: Write the implementation**

Create `src/space/domains/cycle.ts`:

```ts
import type { Domain } from '../domain'
import type { Intents } from '../intents'

/** Radians of turn that add up to one step along the ring. */
export const STEP_THRESHOLD = 0.35

export type CycleState = {
  index: number
  /** Turn banked but not yet spent on a step. */
  turned: number
  /** True once something has been picked; the ring stops taking input. */
  chosen: boolean
}

/**
 * A ring of n things, one of them in front.
 *
 * Zero-dimensional and cyclic — the smallest space in the collection, and the
 * one that is not `Embodied`: a transformation changes the world while the
 * viewer holds still, so there is no pose here and no rig. What the hub takes
 * from this design is its input, so that the arrow keys mean one thing.
 */
export function cycleDomain(count: number): Domain<CycleState> {
  return {
    needs: ['yaw', 'act'],

    initial: (): CycleState => ({ index: 0, turned: 0, chosen: false }),

    step(state: CycleState, intents: Intents): CycleState {
      if (state.chosen) return state
      if (intents.act) return { ...state, chosen: true }
      if (count <= 1) return state

      let index = state.index
      let turned = state.turned + intents.yaw

      while (Math.abs(turned) >= STEP_THRESHOLD) {
        const step = Math.sign(turned)
        index = (((index + step) % count) + count) % count
        turned -= step * STEP_THRESHOLD
      }

      return { index, turned, chosen: false }
    },
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm test -- tests/unit/space/domains/cycle.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Verify the build and commit**

```bash
npm run build
git add src/space/domains/cycle.ts tests/unit/space/domains/cycle.test.ts
git commit -m "feat: the cycle domain, so the arrow keys mean one thing"
```

---

### Task 10: The hook and the rig

This is where React finally appears. Everything before it is pure.

**Files:**
- Create: `src/space/useNavigation.ts`, `src/space/Rig.tsx`
- Test: none new — this is wiring over modules already covered, and it is proved by the room ports and the end-to-end suite.

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces:
  - `function useSignals(): { drain: (now: number) => Signals }`
  - `function useNavigation<S>(domain: Domain<S>, techniques: readonly Technique<never>[]): { state: RefObject<S>; advance: (seconds: number, now: number) => void }`
  - `function Rig({ pose, pitch }: { pose: Pose; pitch: number }): null`

- [ ] **Step 1: Write `src/space/useNavigation.ts`**

```ts
import { useEffect, useRef, type RefObject } from 'react'
import type { Domain } from './domain'
import type { Press } from './gesture'
import type { Signals, Technique } from './technique'
import { runTechniques } from './technique'

/**
 * Raw input, collected between frames.
 *
 * Pointer events arrive whenever the browser feels like it and keys are a set
 * that changes under us, so both are gathered into refs and drained once per
 * frame. That is also what makes the techniques pure: they are handed a frame's
 * worth of signal rather than subscribing to the window themselves.
 */
function useSignals(): { drain: (now: number) => Signals } {
  const keys = useRef(new Set<string>())
  const presses = useRef<Press[]>([])

  useEffect(() => {
    const down = (event: PointerEvent) =>
      presses.current.push({ kind: 'down', x: event.clientX, y: event.clientY, at: event.timeStamp })
    const move = (event: PointerEvent) =>
      presses.current.push({ kind: 'move', x: event.clientX, y: event.clientY, at: event.timeStamp })
    const up = (event: PointerEvent) => presses.current.push({ kind: 'up', at: event.timeStamp })
    const cancel = (event: PointerEvent) =>
      presses.current.push({ kind: 'cancel', at: event.timeStamp })

    const keyDown = (event: KeyboardEvent) => keys.current.add(event.key.toLowerCase())
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    // A tab switch mid-press never delivers the keyup, leaving the viewer
    // walking forever on their return.
    const blur = () => {
      keys.current.clear()
      presses.current.push({ kind: 'cancel', at: performance.now() })
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)

    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const drain = (now: number): Signals => {
    // The tick is what lets a press held perfectly still become a walk: a
    // finger that does not move generates no events at all.
    const collected = [...presses.current, { kind: 'tick', at: now } as const]
    presses.current = []
    return { keys: keys.current, presses: collected, now }
  }

  return { drain }
}

/**
 * A domain, driven by whatever the visitor has to hand.
 *
 * State in refs rather than React state: it changes on every frame and every
 * pixel of a drag, and nothing in the tree renders differently for it.
 */
export function useNavigation<S>(
  domain: Domain<S>,
  techniques: readonly Technique<unknown>[],
): { state: RefObject<S>; advance: (seconds: number, now: number) => void } {
  const state = useRef<S>(domain.initial())
  const techniqueStates = useRef<unknown[]>(techniques.map((technique) => technique.initial()))
  const { drain } = useSignals()

  const advance = (seconds: number, now: number) => {
    const outcome = runTechniques(techniques, techniqueStates.current, drain(now), seconds)
    techniqueStates.current = outcome.states
    state.current = domain.step(state.current, outcome.intents, seconds)
  }

  return { state, advance }
}
```

- [ ] **Step 2: Write `src/space/Rig.tsx`**

```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Pose } from './pose'

/**
 * The head's own axis of tilt, in camera-local terms.
 *
 * A camera looks along its −Z with +Y over its head, so rotating about +X
 * swings −Z towards +Y — which is looking up.
 */
const PITCH_AXIS = new Vector3(1, 0, 0)

/**
 * Where the domain says the viewer is, applied to the camera.
 *
 * The one place in the codebase that touches the camera. Rooms emit a pose and
 * nothing else, which is what makes XR reachable at all: there the headset
 * owns the camera and this same pose goes onto an XROrigin instead, without a
 * room being edited.
 *
 * Pitch is applied here rather than folded into the pose because in XR it must
 * be dropped — a domain's pitch would tilt the world beneath a stationary
 * head, which is both wrong and nauseating.
 */
export function Rig({ pose, pitch }: { pose: Pose; pitch: number }): null {
  const camera = useThree((state) => state.camera)
  const tilt = new Quaternion()

  useFrame(() => {
    camera.position.copy(pose.position)
    camera.quaternion
      .copy(pose.orientation)
      .multiply(tilt.setFromAxisAngle(PITCH_AXIS, pitch))
    // The camera's own up is derived from the quaternion now, but three still
    // reads it in places (lookAt, controls). Keeping it consistent avoids a
    // room that rolls the moment anything else touches the camera.
    camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
  })

  return null
}
```

**Correction made during implementation.** `Rig` was specified as taking a plain `pose` prop. That cannot work: a room advances its state inside `useFrame` and never re-renders for it, so a pose passed as a prop would be the one computed at the room's last React render and would never change again. The rig therefore takes the domain, the state ref and `advance`, and does all three in one frame callback — which also removes any question about whether the rig's `useFrame` runs before or after the room's.

```tsx
<Rig domain={shell} state={here} advance={advance} />
```

The room must **not** also call `advance` in its own `useFrame`, or every frame of input is applied twice.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: exits 0. Nothing imports these yet, so there is nothing else to check.

- [ ] **Step 4: Commit**

```bash
git add src/space/useNavigation.ts src/space/Rig.tsx
git commit -m "feat: the hook that drives a domain and the rig that owns the camera"
```

---

### Task 11: Port SVR

**Files:**
- Modify: `src/rooms/svr/SphericalRoom.tsx`
- Delete: `src/rooms/svr/useFirstPerson.ts`

- [ ] **Step 1: Record the behaviour before touching anything**

Run: `npm run build && npm run preview` in one shell, and in another `npm run e2e -- --grep "spherical"`.
Expected: PASS. Note how many tests ran — the same must pass afterwards.

Kill the preview when done:

```bash
ss -ltnp 2>/dev/null | grep -E ":4173 " | grep -oP 'pid=\K[0-9]+' | sort -u | while read p; do kill "$p"; done
```

- [ ] **Step 2: Swap the hook for the domain**

In `src/rooms/svr/SphericalRoom.tsx`:

Remove the `useFirstPerson` import and the imports of `gazeAt` and `headUpAt` from `./gaze`. Keep the imports of `eyeAt`, `upAt` and `walk` from `./walk` — the wall placement at lines 316–318 still uses them.

Add:

```tsx
import { shellDomain } from '../../space/domains/shell'
import { keysTechnique } from '../../space/techniques/keys'
import { pointerTechnique } from '../../space/techniques/pointer'
import { useNavigation } from '../../space/useNavigation'
import { Rig } from '../../space/Rig'
```

Replace the `useFirstPerson()` call with:

```tsx
// The room's own numbers, not the domain's: how big the shell is and how tall
// the viewer is are facts about this space.
const shell = useMemo(() => shellDomain(SHELL_RADIUS, EYE_HEIGHT), [])
const { state: here, advance } = useNavigation(shell, [keysTechnique, pointerTechnique])
```

- [ ] **Step 3: Delete the camera code from the room's frame loop**

In the `useFrame` callback, replace the block that reads

```tsx
    camera.position.copy(eyeAt(here, SHELL_RADIUS - EYE_HEIGHT))
    ...
    camera.up.copy(headUpAt(here, tilt))
    camera.lookAt(lookingAt.copy(camera.position).add(gazeAt(here, tilt)))
```

with nothing. The rig advances the state and applies it; the room's own `useFrame` must not call `advance` as well.

Keep `lamp.current?.position.copy(camera.position)` — the lamp follows the viewer and that is the room's business, not the rig's. Anything else in the loop that read `camera` should read `shell.poseOf(here.current).position` instead.

Delete the now-unused `lookingAt` scratch vector and the `useThree` camera subscription if nothing else uses it.

- [ ] **Step 4: Mount the rig**

In the room's returned JSX, add as the first child:

```tsx
<Rig domain={shell} state={here} advance={advance} />
```

- [ ] **Step 5: Delete the old hook**

```bash
git rm src/rooms/svr/useFirstPerson.ts
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm test`
Expected: build exits 0; all unit tests pass.

Then `npm run preview` and `npm run e2e -- --grep "spherical"` in another shell.
Expected: the same tests pass as in Step 1. Kill the preview afterwards.

- [ ] **Step 7: Check it by eye, on both devices**

The e2e suite proves pixels change; it does not prove the room is right way up. Open the preview, walk forward, turn, and look up at the object. Then resize to a phone viewport and confirm a held press walks you.

- [ ] **Step 8: Commit**

```bash
git add -A src/rooms/svr src/space
git commit -m "refactor: SVR walks on the shell domain"
```

---

### Task 12: Port papercup

**Files:**
- Modify: `src/rooms/papercup/StringRoom.tsx`
- Delete: `src/rooms/papercup/useCorridorWalk.ts`

- [ ] **Step 1: Record the behaviour before touching anything**

Run the papercup e2e tests against a preview, as in Task 11 Step 1: `npm run e2e -- --grep "papercup"`. Note the count.

- [ ] **Step 2: Swap the hook for the domain**

In `src/rooms/papercup/StringRoom.tsx`, remove the `useCorridorWalk` import and add:

```tsx
import { corridorDomain } from '../../space/domains/corridor'
import { keysTechnique } from '../../space/techniques/keys'
import { pointerTechnique } from '../../space/techniques/pointer'
import { useNavigation } from '../../space/useNavigation'
import { Rig } from '../../space/Rig'
```

Replace the `useCorridorWalk(WALKABLE, ARRIVAL)` call with:

```tsx
const corridor = useMemo(() => corridorDomain(WALKABLE, ARRIVAL, EYE_HEIGHT), [])
const { state: here, advance } = useNavigation(corridor, [keysTechnique, pointerTechnique])
```

- [ ] **Step 3: Delete the camera code and mount the rig**

Remove the `camera.position.set(...)`, `camera.up.set(...)` and `camera.lookAt(...)` block from the frame loop. Do not call `advance` there — the rig does it.

Add as the first child of the returned JSX:

```tsx
<Rig domain={corridor} state={here} advance={advance} />
```

- [ ] **Step 4: Keep the string's own tap, and make it not fight the walk**

The room already spends a tap on picking up the string. That still works — `act` is what a tap produces — but the room must now read it from the domain rather than from its own pointer listeners.

The simplest correct change: leave the room's existing `TAP_SLOP` pointer handling alone for this task and confirm by hand in Step 6 that a **held** press walks and a **tapped** press still sends a pulse. If the two fight, replace the room's listener with a technique in a follow-up rather than widening this task.

- [ ] **Step 5: Delete the old hook**

```bash
git rm src/rooms/papercup/useCorridorWalk.ts
```

- [ ] **Step 6: Verify, including by hand on a phone viewport**

Run: `npm run build && npm test`, then the papercup e2e against a preview.

By hand: hold a press and confirm you walk down the corridor; tap and confirm the string still fires; drag and confirm you look around without walking or firing.

- [ ] **Step 7: Commit**

```bash
git add -A src/rooms/papercup src/space
git commit -m "refactor: papercup walks on the corridor domain"
```

---

### Task 13: Port the mountain

**Files:**
- Modify: `src/rooms/openSkiData/MountainRoom.tsx`

- [ ] **Step 1: Record the behaviour before touching anything**

Run the open-ski-data e2e tests against a preview. Note the count.

- [ ] **Step 2: Swap the room's own input for the domain**

In `src/rooms/openSkiData/MountainRoom.tsx`, delete the `useEffect` that registers the pointer and key listeners, the `journey` ref, the `looking` ref and the `eased` ref. All four are now domain state.

Add:

```tsx
import { mountainDomain } from '../../space/domains/mountain'
import { keysTechnique } from '../../space/techniques/keys'
import { pointerTechnique } from '../../space/techniques/pointer'
import { useNavigation } from '../../space/useNavigation'
import { Rig } from '../../space/Rig'
```

and

```tsx
const mountain = useMemo(
  () => mountainDomain(registry, ARRIVAL_PLACE, EYE_HEIGHT, ARRIVAL_TILT),
  [registry],
)
const { state: here, advance } = useNavigation(mountain, [keysTechnique, pointerTechnique])
```

- [ ] **Step 3: Keep the chosen-link highlight working**

The highlight mirrors the pointed-at link into React state. Keep that, but read it from the domain:

```tsx
const [chosen, setChosen] = useState<string | undefined>(undefined)

useFrame(() => {
  // No advance here: the rig owns it.
  const link = pointedAt(registry, here.current.journey)
  const name = link ? `${link.from}->${link.to}` : undefined
  // Only on change: this is React state read by the highlight, and setting it
  // every frame would re-render the room sixty times a second.
  if (name !== chosen) setChosen(name)
})
```

- [ ] **Step 4: Delete the camera code and mount the rig**

Remove the `camera.position.set(...)`, `camera.up.set(...)`, the `aim`/`eased` lerp and the `camera.lookAt(...)` from the frame loop — the domain does the easing now and the rig does the camera.

Add as the first child of the returned JSX:

```tsx
<Rig domain={mountain} state={here} advance={advance} />
```

- [ ] **Step 5: Update the room's signage**

The board says "left and right to choose · up to go · drag to look". Add the touch gesture, which is now the only way a phone can travel:

```tsx
'left and right to choose · up to go · hold to go · drag to look'
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm test`, then the open-ski-data e2e against a preview.

By hand on a phone viewport: drag left and right and confirm the chosen link changes; hold and confirm you set off; confirm you cannot change link mid-ride.

- [ ] **Step 7: Commit**

```bash
git add -A src/rooms/openSkiData src/space
git commit -m "refactor: the mountain travels on the graph domain"
```

---

### Task 14: Port the hub, and retire `controls.ts`

**Files:**
- Modify: `src/app/App.tsx`
- Delete: `src/rooms/controls.ts`, `tests/unit/rooms/controls.test.ts`
- Modify: `vite.config.ts` (drop `src/rooms/controls.ts` from the allow-list)

- [ ] **Step 1: Replace the hub's key handling**

In `src/app/App.tsx`, the `useEffect` that binds `ArrowRight`, `ArrowLeft`, `Enter` and `Escape` is replaced by the cycle domain driven through the same techniques.

Because the hub's index is React state that other components render from, the domain state is mirrored out rather than held in a ref alone:

```tsx
const cycle = useMemo(() => cycleDomain(rooms.length), [])
```

Drive it from a `requestAnimationFrame` loop in an effect — the hub is outside the `Canvas` and has no `useFrame` — stepping the domain and pushing `index` into `setActiveIndex` and `chosen` into `select`. Guard it on `state.phase === 'browsing'`, which is where the arrows belonged all along:

```tsx
useEffect(() => {
  if (state.phase !== 'browsing') return
  let frame = 0
  let last = performance.now()

  const tick = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000)
    last = now
    advance(seconds, now)
    setActiveIndex(here.current.index)
    if (here.current.chosen) select(rooms[here.current.index].id)
    frame = requestAnimationFrame(tick)
  }

  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}, [state.phase, advance, here, select])
```

Keep `Escape` leaving a room: that is `leave`, and it is produced by the keys technique. Read it from the room's own domain in a follow-up if needed; for this task the existing `ExitButton` and the `Escape` handler for `inRoom` stay as they are, since the hub domain is not mounted inside a room.

- [ ] **Step 2: Check the carousel still browses**

Run: `npm run build && npm run preview`, then in another shell `npm run e2e -- --grep "hub"`.
Expected: PASS.

By hand: arrow keys step, a swipe steps, a click enters, and — the point of this task — the arrows no longer do anything at all inside a room.

- [ ] **Step 3: Delete the old shared controls**

`controls.ts` now has no importers. Confirm it:

```bash
grep -rn "rooms/controls" src/ tests/
```

Expected: no output. Then:

```bash
git rm src/rooms/controls.ts tests/unit/rooms/controls.test.ts
```

In `vite.config.ts`, remove the `'src/rooms/controls.ts',` line from `test.coverage.include`. While there, remove `'src/xr/useXrSupport.ts',` as well — that path does not exist and has been listed for nothing.

- [ ] **Step 4: Verify the whole suite**

Run: `npm run build && npm test && npm run coverage`
Expected: build exits 0; all unit tests pass; coverage at or above 80% on every metric.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: the hub steps on the cycle domain, and controls.ts retires"
```

---

### Task 15: The coverage matrix, wired to the real rooms

The point of the whole design: no room may ship that a phone cannot move in.

**Files:**
- Create: `tests/unit/space/rooms-are-usable.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, test } from 'vitest'
import { PROFILES, unreachableFields } from '../../../src/space/coverage'
import { keysTechnique } from '../../../src/space/techniques/keys'
import { pointerTechnique } from '../../../src/space/techniques/pointer'
import { shellDomain } from '../../../src/space/domains/shell'
import { corridorDomain } from '../../../src/space/domains/corridor'
import { mountainDomain } from '../../../src/space/domains/mountain'
import { cycleDomain } from '../../../src/space/domains/cycle'
import { resort } from '../../../src/rooms/openSkiData/resort'

/**
 * Every space on the site, with the techniques it ships with.
 *
 * A new room is added here in the same commit that adds the room. That is the
 * whole guard rail: for eight months every room bound walking to held keys,
 * so on touch all three were panorama viewers, and nothing said so.
 */
const SPACES = [
  { name: 'svr', domain: shellDomain(9, 1.65), techniques: [keysTechnique, pointerTechnique] },
  {
    name: 'papercup',
    domain: corridorDomain({ alongString: 8.2, acrossString: 2 }, { x: -6.5, z: 1.2, heading: -0.1 }, 1.62),
    techniques: [keysTechnique, pointerTechnique],
  },
  {
    name: 'open-ski-data',
    domain: mountainDomain(resort(), 'base', 1.7, -0.24),
    techniques: [keysTechnique, pointerTechnique],
  },
  { name: 'hub', domain: cycleDomain(5), techniques: [keysTechnique, pointerTechnique] },
]

describe('every space, on every device we claim to support', () => {
  for (const space of SPACES) {
    for (const profile of PROFILES) {
      test(`${space.name} is usable on ${profile.name}`, () => {
        const missing = unreachableFields(space.domain.needs, space.techniques, profile)
        expect(missing, `${space.name} on ${profile.name} cannot ask for: ${missing.join(', ')}`)
          .toEqual([])
      })
    }
  }
})
```

- [ ] **Step 2: Run it**

Run: `npm test -- tests/unit/space/rooms-are-usable.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 3: Prove it is not vacuous**

In `src/space/techniques/pointer.ts`, remove `'advance'` from `produces`.

Run `npm run build` — **confirm it exits 0** — then the test.
Expected: FAIL on three of the four spaces for `phone`, naming `advance`.

Restore and re-run: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/space/rooms-are-usable.test.ts
git commit -m "test: no room may ship that a phone cannot move in"
```

---

### Task 16: Phone locomotion, end to end

The phone project has never asserted movement, because there was none to assert.

**Files:**
- Modify: `tests/e2e/mobile.spec.ts`

- [ ] **Step 1: Read what is already there**

Run: `cat tests/e2e/mobile.spec.ts` and note the existing helpers for entering a room and for comparing frames. Reuse them rather than writing new ones.

- [ ] **Step 2: Write the test**

Append to `tests/e2e/mobile.spec.ts`. Adjust the room-entry helper name to whatever the file already uses.

```ts
test.describe('moving on a phone', () => {
  // Full-framebuffer reads under SwiftShader are slow enough to time a test out.
  test.slow()

  for (const room of ['svr', 'papercup', 'open-ski-data']) {
    test(`a held press moves the viewer in ${room}`, async ({ page }) => {
      await page.goto(`/p/${room}`)
      await page.waitForFunction(() => document.documentElement.dataset.phase === 'inRoom')

      // Let the room settle: place labels finishing their font would otherwise
      // read as movement, which is exactly how a vacuous test gets written.
      await page.waitForTimeout(2500)
      const still = await page.screenshot()
      await page.waitForTimeout(1200)
      expect(await page.screenshot(), 'the room is not still to begin with').toEqual(still)

      const box = page.viewportSize()!
      await page.touchscreen.tap(box.width / 2, box.height / 2) // focus the canvas
      await page.mouse.move(box.width / 2, box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(1800) // past the dwell, and then some walking
      const during = await page.screenshot()
      await page.mouse.up()

      expect(during, 'nobody moved').not.toEqual(still)
    })
  }

  test('a tap does not walk you across the room', async ({ page }) => {
    await page.goto('/p/svr')
    await page.waitForFunction(() => document.documentElement.dataset.phase === 'inRoom')
    await page.waitForTimeout(2500)

    const before = await page.screenshot()
    const box = page.viewportSize()!
    await page.touchscreen.tap(box.width / 2, box.height / 2)
    await page.waitForTimeout(900)

    expect(await page.screenshot(), 'a tap moved the viewer').toEqual(before)
  })
})
```

- [ ] **Step 3: Run it**

```bash
npm run build && npm run preview
```

In another shell: `npm run e2e -- --project=phone`
Expected: PASS.

Kill the preview:

```bash
ss -ltnp 2>/dev/null | grep -E ":4173 " | grep -oP 'pid=\K[0-9]+' | sort -u | while read p; do kill "$p"; done
```

- [ ] **Step 4: Prove it is not vacuous**

In `src/space/gesture.ts`, change `DWELL_MS` from `220` to `999999` — a press can then never become a walk.

Run `npm run build` and **confirm it exits 0 before believing anything**. A type error here aborts the build and leaves `dist/` serving the previous, working bundle, and the test will pass against code you did not change.

Rebuild, restart the preview, re-run `npm run e2e -- --project=phone`.
Expected: FAIL on all three rooms with "nobody moved".

Restore `DWELL_MS`, rebuild, and confirm PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/mobile.spec.ts
git commit -m "test: a phone can move in every room"
```

---

### Task 17: Finish

- [ ] **Step 1: Full verification**

```bash
npm run build && npm test && npm run coverage
```

Expected: build exits 0; every unit test passes; coverage at or above 80% on lines, functions, branches and statements.

```bash
npm run preview
```

In another shell: `npm run e2e`
Expected: every test in both the chromium and phone projects passes.

- [ ] **Step 2: Confirm no room touches the camera**

```bash
grep -rn "camera\." src/rooms/ src/hub/
```

Expected: no hits in the three ported rooms' frame loops. `src/app/Stage.tsx`'s `CameraRig` still sets it for hub framing, which is correct and out of scope.

- [ ] **Step 3: Confirm the dead code is gone**

```bash
grep -rn "useFirstPerson\|useCorridorWalk\|rooms/controls" src/ tests/
```

Expected: no output.

- [ ] **Step 4: Merge and push**

```bash
git checkout main
git merge --no-ff feat/spatial-navigation
git push origin main
```

- [ ] **Step 5: Confirm the deploy**

```bash
gh run list --limit 1
```

Wait for the build and deploy jobs to report success, then confirm a room's chunk is served:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://paulkim-xr.github.io/
```

---

## Notes for the implementer

**On the mutation checks.** Several tasks ask you to break the implementation deliberately and confirm the test fails. `npm run build` is `tsc --noEmit && vite build`: if your mutation does not type-check, the build aborts and `dist/` keeps the previous bundle, so the preview server serves code you did not change and the test passes for the wrong reason. Confirm the build exits 0 before you believe any mutation result. This has already happened once on this project.

**On the room ports.** Tasks 11 to 14 change working, shipped code, and the failure mode is subtly breaking a room that nobody notices for weeks. Each port is its own commit, each verifies against the e2e tests recorded before the change, and each ends with a look by eye — the suite proves pixels change, not that the room is the right way up.

**On what not to touch.** `walk.ts`, `gaze.ts`, `stroll.ts`, `travel.ts`, `graph.ts` and `terrain.ts` are wrapped, not rewritten. Their tests are the reason the ports are safe. If a domain seems to need one of them changed, say so rather than changing it.
