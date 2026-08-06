import { Vector3 } from 'three'
import { facingAt, upAt, type Stance } from './walk'

/**
 * How far the viewer can tilt their head, in radians.
 *
 * Straight up, and no further. At exactly this much the gaze runs along the
 * body axis and lands on the object at the centre of the room, which is as far
 * as looking up ever needs to go — past it you would be looking back down the
 * other side with the room upside down, which is a thing necks do not do.
 */
export const MAX_PITCH = Math.PI / 2

/** How far a head can actually tilt, given how far it was asked to. */
export function clampPitch(radians: number): number {
  return Math.min(MAX_PITCH, Math.max(-MAX_PITCH, radians))
}

/**
 * Which way the viewer is looking: their heading, tilted by `pitch`.
 *
 * At rest this is the horizon. The room is a sphere seen from the inside, so
 * the horizon curves up and away in every direction and the thing they came to
 * see is not in it — it is over their head, and they have to look up. That is
 * the room: a place you walk around in, not a turntable you are strapped to.
 */
export function gazeAt(stance: Stance, pitch: number): Vector3 {
  const tilt = clampPitch(pitch)
  return facingAt(stance)
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(upAt(stance), Math.sin(tilt))
}

/**
 * Which way is up *for the head*, once it has tilted by `pitch`.
 *
 * Tilted by the same angle as the gaze, so the two stay exactly perpendicular
 * however far back the viewer leans. This is not a detail: a camera builds its
 * basis from the cross product of its view direction and its up-vector, so
 * passing the body's up while looking nearly along it leaves that product
 * near zero, and the picture rolls wildly and then falls over at the top of the
 * arc — precisely where the object being looked at is.
 */
export function headUpAt(stance: Stance, pitch: number): Vector3 {
  const tilt = clampPitch(pitch)
  return upAt(stance)
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(facingAt(stance), -Math.sin(tilt))
}
