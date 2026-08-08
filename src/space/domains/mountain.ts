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
 *
 * The eased aim lives in the state rather than in the room, so that the pose
 * is a pure function of where the journey has got to and the settling can be
 * tested at all.
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
        aim: state.aim
          .clone()
          .lerp(wants(journey), Math.min(1, EASE * seconds))
          .normalize(),
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
