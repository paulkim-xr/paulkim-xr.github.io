import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

/** A four-sided peak with a camera pointed at it. */
export function skiwatchShape(): BufferGeometry {
  const mountain = new ConeGeometry(0.68, 0.86, 4)
  const body = new BoxGeometry(0.26, 0.19, 0.19)
  const lens = new CylinderGeometry(0.07, 0.07, 0.08, 10)

  // The camera sits just off the peak rather than out in space beside it: far
  // enough not to intersect the slope, close enough to read as watching it.
  return merge(
    positionsOf(mountain, placement({ position: [0, -0.24, 0], rotation: [0, Math.PI / 4, 0] })),
    positionsOf(body, placement({ position: [0.38, 0.34, 0.12], rotation: [0, 0.5, 0] })),
    positionsOf(lens, placement({ position: [0.24, 0.34, 0.18], rotation: [0, 0, Math.PI / 2] })),
  )
}
