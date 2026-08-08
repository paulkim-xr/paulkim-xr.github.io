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
  /**
   * How far back the head is tilted.
   *
   * Kept apart from the stance so that walking carries the head with it and
   * looking up leaves the viewer standing exactly where they were.
   */
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
 *
 * The radius and eye height are the room's rather than the domain's, so this
 * is a factory: how big the shell is is a fact about that space, not about
 * spheres.
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
