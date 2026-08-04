import { CylinderGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

const SEGMENTS = 16

/**
 * The paper cup telephone: speak into one, it emerges from the other.
 *
 * Cylinder geometry runs along Y, so every part is turned a quarter turn about
 * Z to lie along X. Two cups plus the taut line between them.
 */
export function papercupShape(): BufferGeometry {
  const cup = new CylinderGeometry(0.34, 0.21, 0.48, SEGMENTS, 1, true)
  const line = new CylinderGeometry(0.011, 0.011, 0.78, 6)

  return merge(
    positionsOf(cup, placement({ position: [0.6, 0, 0], rotation: [0, 0, Math.PI / 2] })),
    positionsOf(line, placement({ rotation: [0, 0, Math.PI / 2] })),
    positionsOf(cup, placement({ position: [-0.6, 0, 0], rotation: [0, 0, -Math.PI / 2] })),
  )
}
