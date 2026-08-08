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
 * The yaw is applied as it arrives, without a negation. A heading is measured
 * clockwise from above, so increasing it *is* turning to the right, which is
 * what a positive yaw means everywhere else. The hook this replaces negated it
 * and left the room turning the opposite way from the sphere on the same drag
 * — the comment there claimed the negation kept them in step and it did the
 * reverse.
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
            turned: intents.yaw,
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
