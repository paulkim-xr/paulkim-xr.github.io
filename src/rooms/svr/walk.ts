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
 * The stance reached by turning on the spot, in radians, positive to the right.
 *
 * Turning is not a step and does not belong in one: it changes which way the
 * viewer faces without changing where they are standing. Composed on the right
 * about the axis their own body is on, which is the one direction a rotation
 * can leave a point on a sphere exactly where it was — so this moves the view
 * and nothing else, at any point on the surface including the poles.
 */
export function turn(stance: Stance, radians: number): Stance {
  if (radians === 0) return stance

  return {
    orientation: stance.orientation
      .clone()
      .multiply(new Quaternion().setFromAxisAngle(NORTH_POLE, radians))
      .normalize(),
  }
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
 * Perpendicular to up by construction, so together they are the two axes of a
 * head: this is the horizon a standing viewer looks at, and `upAt` is the way
 * they tilt to look off it. The object hanging at the centre is straight up
 * from here, which is the whole reason looking up is a thing you do in this
 * room rather than the only thing you can do.
 */
export function facingAt(stance: Stance): Vector3 {
  return FACING.clone().applyQuaternion(stance.orientation)
}
