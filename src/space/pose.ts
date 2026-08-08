import { Matrix4, Quaternion, Vector3 } from 'three'

/**
 * Where the viewer's body is, in the room's own render frame.
 *
 * The orientation is a quaternion rather than a heading angle, and the sphere
 * room settles it: standing on the inside of a shell, up points at the centre
 * and is therefore different at every point on the surface. A heading scalar
 * can express the corridor and the mountain but not that, and a pose type that
 * fits three rooms out of four is not a pose type.
 *
 * Head tilt is deliberately not in here. The rig applies it flat and drops it
 * in XR, where the neck owns it — and keeping it out means dropping it is not
 * a decomposition.
 */
export type Pose = {
  /** Where the eyes are. */
  position: Vector3
  /** Body orientation: facing and up together. */
  orientation: Quaternion
}

const ORIGIN = new Vector3(0, 0, 0)

/**
 * The orientation of a body facing `facing` with `up` over its head.
 *
 * `Matrix4.lookAt` builds a basis whose −Z points from the eye at the target,
 * which is the direction a camera looks, so passing the facing as the target
 * from the origin gives exactly the rotation wanted.
 */
export function orientationOf(facing: Vector3, up: Vector3): Quaternion {
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(ORIGIN, facing, up))
}
