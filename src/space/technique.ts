import type { ComponentType } from 'react'
import type { Press } from './gesture'
import { sumIntents, type IntentField, type Intents } from './intents'
import type { Pose } from './pose'

/** A kind of raw input a device may or may not offer. */
export type Signal = 'keys' | 'pointer' | 'hands' | 'gaze' | 'controllers'

/** Everything raw that arrived this frame. */
export type Signals = {
  /** Keys currently down, lower-cased. What level-triggered demands read. */
  keys: ReadonlySet<string>
  /**
   * Keys that went down since the last frame, lower-cased.
   *
   * Edges are defined by the event, not by sampling. A key struck and released
   * between two frames never appears in `keys` at all — a quick tap of the
   * space bar would simply be lost — and a key held down repeats its `keydown`
   * forever, which sampling cannot tell from a fresh press.
   */
  struck: ReadonlySet<string>
  /** Pointer events since the last frame, in order, ending with a tick. */
  presses: readonly Press[]
  /** Wheel travel since the last frame. A notch is of the order of 100. */
  wheel: number
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
 *
 * `reduce` and `initial` are methods rather than arrow properties on purpose.
 * TypeScript compares method parameters bivariantly even under
 * `strictFunctionTypes`, which is what lets `AnyTechnique` below hold
 * techniques with different state types; written as arrows the parameter
 * position would be strictly contravariant and a mixed list would stop
 * compiling.
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
 * A technique in a list, where the state types differ and only its owner knows
 * which is which.
 *
 * `Fixture` is dropped rather than widened. `reduce` and `initial` are methods,
 * which TypeScript compares bivariantly even under `strictFunctionTypes`, so
 * they survive the widening to `unknown` — but `Fixture` is a property holding
 * a `ComponentType`, which is checked strictly and would make every technique
 * with its own state type unassignable. Nothing running a list needs it: the
 * fixtures are mounted by the room that owns them, which knows the real type.
 */
export type AnyTechnique = Omit<Technique<unknown>, 'Fixture'>

/**
 * Every active technique advanced one frame, and everything they asked for.
 *
 * States are kept parallel to the technique list rather than keyed by id, so a
 * room may run the same technique twice — two ropes, one at each end — without
 * them sharing a grip.
 */
export function runTechniques(
  techniques: readonly AnyTechnique[],
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
