import { CylinderGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

const SEGMENTS = 16

/**
 * The paper cup telephone: speak into one, it emerges from the other.
 *
 * Cylinder geometry runs along Y with the wide end — the cup's mouth — at +Y,
 * so every part is turned a quarter turn about Z to lie along X.
 *
 * The sign of that quarter turn is the whole shape. The string is knotted
 * through the *base* of each cup, so the bases face each other and the mouths
 * face out, towards the mouth that speaks and the ear that listens. Turned the
 * other way it is two funnels drinking from a shared straw.
 */
export function papercupShape(): BufferGeometry {
  const cup = new CylinderGeometry(0.34, 0.21, 0.48, SEGMENTS, 1, true)
  const line = new CylinderGeometry(0.011, 0.011, 0.78, 6)

  return merge(
    positionsOf(cup, placement({ position: [0.6, 0, 0], rotation: [0, 0, -Math.PI / 2] })),
    positionsOf(line, placement({ rotation: [0, 0, Math.PI / 2] })),
    positionsOf(cup, placement({ position: [-0.6, 0, 0], rotation: [0, 0, Math.PI / 2] })),
  )
}
