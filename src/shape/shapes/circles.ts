import { TorusGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

const RADIUS = 0.72
const TUBE = 0.035

/**
 * Three rings, one per colour channel, set at right angles to each other.
 *
 * The piece itself is flat; this is its emblem rather than a view of it. Three
 * because that is the number the work is built on — one curve per channel —
 * and interlocked because what the piece measures is where they overlap.
 */
export function circlesShape(): BufferGeometry {
  const ring = new TorusGeometry(RADIUS, TUBE, 4, 26)

  return merge(
    positionsOf(ring),
    positionsOf(ring, placement({ rotation: [Math.PI / 2, 0, 0] })),
    positionsOf(ring, placement({ rotation: [0, Math.PI / 2, 0] })),
  )
}
