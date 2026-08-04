import { Vector3 } from 'three'
import { Movement } from '../lib/morph/Movement'
import type { WigglyGeometry } from '../lib/morph/WigglyGeometry'

/**
 * How far a settled vertex may drift from where the shape says it belongs.
 *
 * The ceiling is the finest feature any shape has, not what looks lively on a
 * big one: at 0.022 the drift exceeded project-beta's 0.018-radius route tube
 * and shook it into a zigzag. Alive, but never larger than the detail.
 */
export const WIGGLE_DOF = 0.01

/**
 * Waypoints per vertex. Movement's own default is 30, and getCurrentPoint
 * walks the list linearly every frame for every vertex — at a few hundred
 * vertices that scan is the whole per-frame cost of the hub.
 */
const WAYPOINTS = 6

/**
 * A closed random walk whose every waypoint sits inside a sphere of radius
 * `dof` around the origin, so the whole path stays inside it too.
 */
function wander(dof: number): Vector3[] {
  return Array.from({ length: WAYPOINTS }, () =>
    new Vector3().randomDirection().multiplyScalar(Math.random() * dof),
  )
}

/**
 * Idle movements for a geometry that has just been told where it is going.
 *
 * Call this *after* transformTo: transformTo overwrites `vertices` with the
 * destination before it builds the transition, so the origins read here are
 * the shape being morphed into, not the one being left behind.
 */
export function wiggleMoves(geometry: WigglyGeometry, dof: number = WIGGLE_DOF): Movement[] {
  const count = geometry.vertices.length / 3

  return Array.from(
    { length: count },
    (_, index) =>
      new Movement({
        origin: geometry.getVertex(index) ?? new Vector3(),
        paths: wander(dof),
        closed: true,
        dof,
      }),
  )
}
