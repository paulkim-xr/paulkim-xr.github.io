import { Quaternion, Vector3 } from 'three'

/**
 * Where a viewer is standing on a sphere, and which way up they are.
 *
 * Held as a single orientation quaternion rather than a latitude and longitude,
 * and this is the whole design. Walking the inside of a sphere means your up
 * vector points at the centre, so it is different at every point — and any
 * scheme that stores position as two angles has to rebuild that orientation
 * from them every frame. At the poles the two angles stop being independent,
 * the reconstruction loses a degree of freedom, and the view snaps or spins.
 *
 * A quaternion has no poles. Walking is a rotation applied to the one you
 * already have, so there is never a moment where an orientation is derived from
 * angles and there is nothing to gimbal-lock.
 */
export type Stance = {
  /** Rotation taking the reference stance to this one. Always unit length. */
  orientation: Quaternion
}

/** Where the viewer stands before anything has moved them. */
export const NORTH_POLE: Vector3 = new Vector3(0, 0, 1)

/** The stance a room opens on. */
export function initialStance(): Stance {
  return { orientation: new Quaternion() }
}

/**
 * A step across the surface, in radians of arc.
 *
 * `forward` walks along the direction the viewer faces; `sideways` walks across
 * it. Both are rotations of the stance, not translations of a point, so a step
 * carries the viewer's whole frame — including which way is up — with it.
 */
export type Step = {
  forward: number
  sideways: number
}

const FORWARD_AXIS = new Vector3(1, 0, 0)
const SIDEWAYS_AXIS = new Vector3(0, 1, 0)

/**
 * The stance reached by taking `step` from `stance`.
 *
 * Composed on the right, so the axes are the viewer's own rather than the
 * world's: walking forward means forward from where they are facing now, which
 * is what makes a path across the surface follow the hand rather than the
 * globe. Renormalised because a few thousand composed rotations will otherwise
 * drift off unit length and start scaling the scene.
 */
export function walk(stance: Stance, step: Step): Stance {
  const orientation = stance.orientation.clone()

  if (step.sideways !== 0) {
    orientation.multiply(new Quaternion().setFromAxisAngle(SIDEWAYS_AXIS, step.sideways))
  }
  if (step.forward !== 0) {
    orientation.multiply(new Quaternion().setFromAxisAngle(FORWARD_AXIS, step.forward))
  }

  return { orientation: orientation.normalize() }
}

/**
 * Where on a sphere of `radius` the stance puts the viewer's eyes.
 *
 * The reference point is the north pole, carried around by the orientation.
 */
export function eyeAt(stance: Stance, radius: number): Vector3 {
  return NORTH_POLE.clone().multiplyScalar(radius).applyQuaternion(stance.orientation)
}

/**
 * Which way is up for the viewer: along the surface normal, towards the centre.
 *
 * Inwards, not outwards. They are standing on the *inside* of the shell, so the
 * floor is behind their feet and the middle of the sphere is over their head —
 * which is where the object they came to look at is hanging.
 */
export function upAt(stance: Stance): Vector3 {
  return eyeAt(stance, 1).negate()
}

/** The direction a forward step travels in: tangent to the surface. */
const FACING = new Vector3(0, -1, 0)

/**
 * Which way the viewer is facing, along the surface.
 *
 * Perpendicular to up by construction, so it is a legal camera up-vector — and
 * the useful one. The object being viewed is directly overhead, so the camera
 * looks straight along the body axis and *some* tangent has to decide which way
 * round the picture sits. Using the direction of travel means walking forward
 * slides the view rather than spinning it.
 */
export function facingAt(stance: Stance): Vector3 {
  return FACING.clone().applyQuaternion(stance.orientation)
}
