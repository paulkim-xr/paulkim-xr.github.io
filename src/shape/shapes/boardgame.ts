import { BoxGeometry, OctahedronGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

/** Two peers, no server: a board on each side and a packet crossing between. */
export function boardgameShape(): BufferGeometry {
  const board = new BoxGeometry(0.62, 0.09, 0.62)
  const packet = new OctahedronGeometry(0.12)

  // The tilt is baked in rather than applied to a parent group, so the boards
  // read as boards from the hub camera without any wrapper to inherit from.
  const tilt: [number, number, number] = [0.35, 0.4, 0]

  return merge(
    positionsOf(board, placement({ position: [-0.52, -0.1, 0], rotation: tilt })),
    positionsOf(board, placement({ position: [0.52, -0.1, 0], rotation: tilt })),
    positionsOf(packet, placement({ position: [0, 0.28, 0], rotation: tilt })),
  )
}
