# Spatial Navigation — Design

**Date:** 2026-08-08
**Status:** Approved in principle; awaiting written review
**Repo:** `paulkim-xr/paulkim-xr.github.io`
**Supersedes:** the Flat/XR parity table and the Comfort section of
`2026-08-03-xr-homepage-design.md` (see *Supersessions*).

## Purpose

Give the site one way to express movement, so that a visitor on any device can
move through every room, and so that new kinds of space can be added without
inventing a new control scheme each time.

The long-term goal is a library: developers define transitions, transformations,
movement, orientation and interaction over spaces of their own design. This spec
does not build that library. It builds the layer the library would sit on, and
proves it against the four spaces the site already has.

## The problem

Three defects, found by reading what is actually bound today.

**1. Nothing can move on a phone.** Every room binds walking to held keys and
reads the pointer for looking only. On touch, all three rooms are panorama
viewers: you may look around the sphere, look down the corridor and look at the
mountain, but you cannot take a step or ride a lift. This is the device most
visitors arrive on.

**2. There is no XR path.** `src/app/App.tsx` passes `xrMode={false}` as a
literal. `@react-three/xr` is a dependency but only `src/spike/MicSpike.tsx`
imports it. The 2026-08-03 spec asserts "every space is enterable in a headset";
that is not true of the code.

**3. The arrow keys mean four different things.** They step the carousel on the
hub, walk and turn in SVR and papercup, choose an outgoing link in
open-ski-data, and do nothing in a room that orbits. A visitor learns the
controls three times and is wrong twice.

Structurally, each room registers its own `window` listeners, so there is no
seam at which a new device could be taught to drive them.

## The five verbs

Movement is not the only thing a visitor does, and conflating the five is why
one key ended up with four meanings.

| verb | what changes |
|---|---|
| **Movement** | the viewer's state; the world holds still |
| **Orientation** | where the viewer looks, independent of where they are |
| **Interaction** | a thing in the world, without moving and without transforming it |
| **Transformation** | the world's state; the viewer holds still |
| **Transition** | the world itself is exchanged for another |

`MorphHub` is a transformation and always was, which is why it never fitted
under "controls". The whiteout is a transition.

**Orientation is split from movement on a portability argument, not a tidy
one.** In XR the headset owns orientation and the application must not set it,
while movement is always commandable. Two pieces of evidence that the seam is
real: SVR already keeps `stance` and `pitch` as separate refs deliberately, and
the live mobile defect is exactly "orientation works everywhere, movement works
nowhere".

## Architecture

```
device signals + body facts  →  technique  →  intents  →  domain  →  pose  →  rig
```

Everything from `technique` to `pose` is pure. Only the rig and the techniques'
fixtures touch the scene.

### Intents

An intent is **a demand with a magnitude**. Continuous domains integrate it over
the frame; discrete domains latch or threshold it. This is the decision that is
expensive to reverse: if `advance` were an event the sphere could not use it,
and if it were only a rate the graph and the carousel could not.

| field | verb | kind | unit |
|---|---|---|---|
| `advance` | movement | signed demand | normalised −1..1 |
| `strafe` | movement | signed demand | normalised −1..1 |
| `yaw` | orientation | signed demand | radians |
| `pitch` | orientation | signed demand | radians |
| `act` | interaction | edge | — |
| `leave` | transition | edge | — |

**Movement is normalised and orientation is absolute**, and the asymmetry is
principled rather than a convenience. A step means radians of arc on a shell and
metres of floor in a corridor, so its scale belongs to the domain, which
multiplies the demand by its own pace and the frame. A turn means radians
everywhere — rotation has one unit in every space. The existing `Rates` bears
this out exactly: SVR and papercup disagree on `move` (0.85 against 3.4) and
agree on `look` (1.1 in both).

This is also what lets a held key and a drag sum coherently on the same axis.
Both produce radians of yaw; a rate integrated over the frame and an impulse
measured in pixels are the same kind of quantity by the time they are intents.

Six fields, deliberately. A small vocabulary is cheap to widen and expensive to
shrink, because every field added is one that every future domain must answer.

**Transformation is not an intent.** It is a domain whose state change is a
world change rather than a viewer change.

`strafe` is a convenience for people who have keys or a stick. No domain may
list it under `needs`.

### Facts and demands

A **demand** is the visitor asking for change. It flows through a technique and
becomes an intent.

A **fact** is where a body actually is — head, hands — and arrives from the
device as world data. Flat mode has no body facts. XR has them for free.

A room may read facts and must render correctly without them. "Enhanced in XR"
is therefore not a flag on a type; it is a room choosing to read hands, decided
per room like any other creative matter.

### Techniques

The technique is the creative surface. Locomotion is not a fixed binding table.

```ts
interface Technique<S> {
  produces: IntentField[]
  requires: Signal[]                                   // pointer | keys | hands | gaze | controllers
  reduce(state: S, signals: Signals, seconds: number): { state: S; intents: Intents }
  Fixture?: ComponentType<{ state: S; pose: Pose }>
}
```

A technique may own state and geometry. Pulling a rope is not a function from
input to intents: there is a rope, it hangs somewhere, you grip it, and the
grip has an origin. `Fixture` is where the rope is drawn; `reduce` is where the
pull becomes `advance`. Wave-to-rotate is the same shape with no fixture and
hand poses as its signal.

Techniques consume facts and emit demands, which is exactly a rope's shape.

**Techniques compose.** A room declares a list; their intents sum and clamp.
Keys, hold-to-go and a rope may all be live at once, and whichever the visitor
reaches for wins. There is no mode to switch.

**The shipped defaults are ordinary entries in that list, not privileged.**

| technique | requires | produces |
|---|---|---|
| keys | keys | `advance` `strafe` `yaw` `pitch` `act` `leave` |
| drag-look | pointer | `yaw` `pitch` |
| hold-to-go | pointer | `advance` |
| tap | pointer | `act` |

`hold-to-go` is the technique that happens to carry phones. A room may drop it
and supply its own.

**The pointer gesture machine** separates three gestures on one pointer, as a
pure function over a timestamped event stream:

- travels past slop → **look**, for as long as the press lasts
- stays within slop past a dwell → **advance** begins, and continues until release
- released before either → **act**

Hold-to-go was chosen as the default because it is the only gesture shape that
survives touch → hands → gaze unchanged, and it costs no screen in a room that
is the screen. An on-screen joystick is a flat-web convention that dies on
glasses.

It does not collide with the papercup room, which already spends tap on `act`
and drag on look.

### Domains

```ts
interface Domain<State> {
  initial(): State
  step(state: State, intents: Intents, seconds: number): State
  needs: IntentField[]
}

/** A domain that also puts a body somewhere — one you move *through*. */
interface Embodied<State> extends Domain<State> {
  poseOf(state: State): Pose
  pitchOf(state: State): number
}
```

`State` is opaque, which is what admits spaces that are not Euclidean.

**Motion is a transformation composed onto a state, never a delta added to it.**
For a Euclidean room the transformation is a translation, so nothing is lost
today; but the same interface then admits hyperbolic, spherical, Sol, Möbius and
portal spaces without a rewrite. If position were a `Vector3` and motion were
addition, all of those would be excluded mathematically rather than stylistically
— Sol geometry alone breaks it, since there *forward-then-right* differs from
*right-then-forward* and the discrepancy grows with distance.

This is not hypothetical. **SkiWatch is a portal space** — a hut whose windows
each open onto a different resort is an atlas, so its position must be
*(chart, local coordinates)*.

The four domains this spec ports:

| room | domain | `advance` means | `yaw` means |
|---|---|---|---|
| SVR | S² | integrate a geodesic on the shell | turn the stance |
| papercup | R² box | integrate a straight line, clamped by walls | turn the stance |
| open-ski-data | graph | latch: depart along the chosen edge | threshold: choose the next outgoing edge |
| hub | Z/n | — | threshold: step the carousel |

The hub is the one that is **not** `Embodied`, and the split earns itself
there: a transformation changes the world while the viewer holds still, so the
hub has no pose to give and mounts no rig. Its camera framing stays with
`CameraRig`, which already sizes it against the window's aspect. What the hub
takes from this design is its *input* — one meaning for the arrow keys — and
nothing else.

The vocabulary was not designed onto the mountain; the mountain's shipped
controls fall out of it. "Left and right to choose, up to go" *is* thresholded
`yaw` and latched `advance`.

**The retrofit is tractable because the rooms are already this shape.**
`Stance`, `Stroll` and `Journey` are three opaque state types with pure step
functions and existing unit tests. They move under the interface; they are not
rewritten.

### The rig

A pose is where the viewer's body is, in the room's own render frame:

```ts
type Pose = {
  /** Where the eyes are. */
  position: Vector3
  /** Body orientation — facing and up together. Excludes head tilt. */
  orientation: Quaternion
}
```

**Orientation must be a quaternion, not a heading scalar.** SVR settles it: the
viewer stands on the inside of a shell, so up points at the centre and is
therefore different at every point on the surface. `SphericalRoom.tsx` sets
`camera.up` from `headUpAt(stance, tilt)` for exactly this reason, and it is why
`Stance` is stored as an orientation rather than as two angles. A heading scalar
can express the corridor and the mountain but not the sphere, and a pose type
that fits three rooms out of four is not a pose type.

Head tilt is delivered separately rather than folded in:

```ts
pitchOf(state: State): number
```

The rig applies it in flat mode and drops it in XR. Kept out of the quaternion
so that dropping it is not a decomposition.

One component. The room emits `poseOf(state)`; the rig applies it to the camera
in flat mode and to `<XROrigin>` in XR. **A room that moves its viewer never
touches `camera`.**

Rooms that do not move their viewer are unaffected by this slice. The exhibit
template keeps `OrbitControls` — the rooms that omit `ownsCamera`, which look at
an object rather than move through a space. Orbit is itself expressible
as a domain, a sphere of viewpoints about a target, but converting it buys
nothing here.

Today all three rooms write `camera.position` every frame, which is why XR is
blocked by architecture rather than by missing features: adding it would mean
editing every room. Three files now; eight after the remaining rooms land.

One rule follows: **pitch is flat-only, always.** Applying a domain's pitch in
XR tilts the world beneath a stationary head, which is both wrong and
nauseating. SVR lists `pitch` under `needs` on flat — it is the only way to see
the object overhead — and does not need it in XR, where you look up.

Yaw does apply in XR, as snap-turn.

### `needs` and the coverage matrix

A domain lists the intent fields without which it cannot function.

For every room × every shipped device profile, assert that the available
techniques between them produce every needed field. **This is a unit test, not a
review.** A room offering only rope-pull fails on desktop-keyboard in CI.

This is the guard rail that makes unlimited freedom in techniques safe, and it
is the test that would have caught "a phone cannot move" on the day it was
introduced.

## Scope

### In

1. `src/space/intents.ts` — the six fields, summing, clamping.
2. `src/space/technique.ts` and the shipped defaults, including the pointer
   gesture machine.
3. `src/space/domain.ts` and `Rig`. Rooms stop touching the camera.
4. Ports of four domains: S², R² box, graph, Z/n. The hub is included
   specifically so the arrow keys stop meaning four things; `MorphHub`'s visuals
   do not change, only where its stepping comes from.
5. The `needs` × device-profile coverage test.
6. Phone locomotion end-to-end coverage in all three rooms.

### Out

- **XR.** Its own spec: session entry, `XROrigin` beneath the rig, controller
  and hand techniques, snap-turn, pitch dropped. Verification needs the headset,
  and the flat retrofit must not wait on hardware.
- Hyperbolic, spherical, Sol or portal domains. The interface must admit them;
  this spec builds none of them.
- The published library — registration, packaging, documented API.
- Renaming transformation and transition into library primitives. The whiteout
  and `MorphHub` keep working as they are.
- The rope technique for the papercup corridor, and SkiWatch. Both follow.

## Testing

- **Techniques** — `reduce` is pure over (state, signals, seconds). The gesture
  machine is tested against timestamped event streams.
- **Domains** — `step` and `poseOf` are pure. Existing tests for `walk.ts`,
  `stroll.ts` and `travel.ts` come along.
- **Coverage matrix** — as above, a test rather than a review.
- **End-to-end** — Playwright already runs chromium and a phone project. The
  phone project gains locomotion assertions for the first time; today it can
  only prove looking.
- Coverage thresholds and the existing allow-list in `vite.config.ts` extend to
  `src/space/**`.
- A mutation check is believed only when `npm run build` is verified green
  first. `npm run build` is `tsc --noEmit && vite build`, so a type error aborts
  it and leaves `dist/` holding the previous bundle — a mutation that never
  reached the browser reads as a passing test.

## Risks

**This refactors shipped, working code.** The failure mode is subtly breaking a
room that nobody notices for weeks.

Mitigations: room-by-room commits; the existing 35 end-to-end tests as the net,
since they assert what the rooms do independently of how input reaches them;
and no room ported until its domain's unit tests pass unchanged.

**A second risk is over-generalising.** The interface is justified by four
domains that exist, and by named spaces it must not exclude. It is not justified
by spaces nobody has designed. Where a choice is not forced by one of those two,
the simpler option is taken.

## Supersessions

The 2026-08-03 spec restricted XR to **teleport locomotion only**, on comfort
grounds, and described flat room navigation as **orbit**. Both have been
overtaken:

- Flat rooms already use continuous first-person movement, and orbit survives
  only for rooms that do not own their camera.
- Teleport is not a policy under this design; it is **a technique** — one that
  produces `advance` as a discrete jump. It ships for XR alongside others rather
  than as the only option.

The comfort concern behind that restriction stands and is better served here.
Self-driven locomotion — rope-pull, hand-over-hand — ties motion to the
visitor's own physical action, which is markedly more comfortable than stick
glide. The graph domain's continuous ride along a link is the one case that
needs explicit comfort treatment in XR, and that belongs to the XR spec.
