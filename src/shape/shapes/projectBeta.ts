import {
  CatmullRomCurve3,
  DodecahedronGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { merge, placement, positionsOf } from '../merge'

const TOP: [number, number, number] = [0.4, 0.62, -0.12]

/** The movement path a climber traces between holds. */
export function projectBetaShape(): BufferGeometry {
  // The route swings through Z as well as X, so the shape still reads as a
  // route when the hub's idle spin turns it side-on.
  const route = new CatmullRomCurve3([
    new Vector3(-0.42, -0.62, 0.2),
    new Vector3(0.34, -0.2, -0.24),
    new Vector3(-0.3, 0.22, 0.26),
    new Vector3(...TOP),
  ])

  const line = new TubeGeometry(route, 24, 0.03, 6, false)
  const hold = new DodecahedronGeometry(0.16)
  const climber = new SphereGeometry(0.09, 8, 6)

  // Parked at the crux — the halfway point of the route.
  const crux = route.getPointAt(0.5)

  return merge(
    positionsOf(line),
    positionsOf(hold, placement({ position: TOP })),
    positionsOf(climber, placement({ position: [crux.x, crux.y, crux.z] })),
  )
}
