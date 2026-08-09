import { DWELL_MS, idleGesture, onPress, type GestureState } from '../gesture'
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
function makePointerTechnique(id: string, dwell: number): Technique<GestureState> {
  const walks = Number.isFinite(dwell)

  return {
    id,
    produces: walks ? ['advance', 'yaw', 'pitch', 'act'] : ['yaw', 'pitch', 'act'],
    requires: ['pointer'],

    initial: idleGesture,

    reduce(state: GestureState, signals: Signals) {
      let gesture = state
      // A local accumulator: everything handed in stays untouched.
      const intents: Intents = { ...NO_INTENTS }

      for (const press of signals.presses) {
        const outcome = onPress(gesture, press, dwell)
        gesture = outcome.state

        intents.yaw -= outcome.dragged.dx * LOOK_PER_PIXEL
        intents.pitch += outcome.dragged.dy * LOOK_PER_PIXEL
        if (outcome.advancing) intents.advance = 1
        if (outcome.acted) intents.act = true
      }

      return { state: gesture, intents }
    },
  }
}

export const pointerTechnique = makePointerTechnique('pointer', DWELL_MS)

/**
 * The pointer, in a space with nowhere to walk.
 *
 * The hub is a ring of things seen from one spot, not somewhere you go, so a
 * press there is only ever a look or a tap. Without this a click held longer
 * than the dwell becomes a walk the hub has no use for, and the tap that
 * should have opened the project is swallowed on release — a slow click would
 * simply not work.
 *
 * A room replacing the shipped technique with one of its own is what the
 * technique list is for; this is the smallest example of it.
 */
export const stillPointerTechnique = makePointerTechnique('pointer-still', Infinity)
