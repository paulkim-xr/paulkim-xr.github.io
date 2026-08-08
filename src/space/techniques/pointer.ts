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

  reduce(state: GestureState, signals: Signals) {
    let gesture = state
    // A local accumulator: everything handed in stays untouched.
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
