import { IcosahedronGeometry, TorusGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

const ORBIT = 0.72

/**
 * Two bodies on an orbit around a third, tilted off the horizontal.
 *
 * The simulation has nine and no stable orbits at all — it collapses. This is
 * the idea of the piece rather than a frame of it: mass, and things falling
 * around mass.
 */
export function gravityShape(): BufferGeometry {
  const primary = new IcosahedronGeometry(0.3, 1)
  const satellite = new IcosahedronGeometry(0.13, 1)
  const path = new TorusGeometry(ORBIT, 0.012, 3, 40)

  const tilt: [number, number, number] = [Math.PI / 2 - 0.42, 0, 0.28]

  return merge(
    positionsOf(primary),
    positionsOf(path, placement({ rotation: tilt })),
    positionsOf(satellite, placement({ position: [ORBIT * 0.94, 0.2, -0.15] })),
    positionsOf(satellite, placement({ position: [-ORBIT * 0.82, -0.28, 0.2], scale: 0.8 })),
  )
}
