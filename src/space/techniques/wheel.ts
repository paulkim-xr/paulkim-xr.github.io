import { NO_INTENTS } from '../intents'
import type { Signals, Technique } from '../technique'

/**
 * How much wheel travel counts as one step.
 *
 * A notch is of the order of 100 in `deltaY`, and browsers disagree on the
 * exact figure, so this is deliberately generous: it only has to be small
 * enough that one notch of a real wheel gets there.
 */
export const WHEEL_PER_STEP = 100

/** What one notch is worth, in the radians every technique speaks. */
const RADIANS_PER_STEP = 0.35

/**
 * Scrolling, for a ring of things.
 *
 * Emits the same radians a drag would, so a discrete space thresholds the two
 * identically and a continuous one turns smoothly under either. Sized so that
 * one notch is about one step of a ring, which is what a wheel is for — but
 * stated here rather than read from the ring, so that the two can be caught
 * disagreeing.
 */
export const wheelTechnique: Technique<null> = {
  id: 'wheel',
  produces: ['yaw'],
  requires: ['pointer'],

  initial: () => null,

  reduce(state: null, signals: Signals) {
    if (signals.wheel === 0) return { state, intents: NO_INTENTS }

    return {
      state,
      intents: { ...NO_INTENTS, yaw: (signals.wheel / WHEEL_PER_STEP) * RADIANS_PER_STEP },
    }
  },
}
