import { PlaneGeometry, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../../shape/merge'
import { tintPanels } from '../panels'
import type { Bounds } from './stroll'

/**
 * Roughly how wide a wall panel is.
 *
 * Sized against the viewer, the same way the sphere's tessellation was: panels
 * much bigger than a person give a wall you cannot judge the distance of, and
 * the room loses its scale.
 */
const PANEL = 0.85

/**
 * The box the room is: floor, ceiling, two long walls and two ends.
 *
 * Built as loose triangles from subdivided planes rather than as a BoxGeometry,
 * for two reasons. A box has one quad a side, and a quad cannot be a wall you
 * can tell the size of. And the panels have to be able to take a tone each,
 * which needs corners that belong to exactly one face.
 *
 * Both ends are closed. That is the room: papercup runs on hardware you own and
 * nothing it hears leaves your network, so the space it gets is sealed, and the
 * string is knotted into a cup at either end rather than disappearing into a
 * wall.
 */
export function corridorGeometry(bounds: Bounds, height: number): BufferGeometry {
  const length = bounds.alongString * 2
  const width = bounds.acrossString * 2
  const half = height / 2

  const face = (w: number, h: number, at: Parameters<typeof placement>[0]) =>
    positionsOf(new PlaneGeometry(w, h, segments(w), segments(h)), placement(at))

  const geometry = merge(
    // Floor and ceiling. A plane faces +z, so it is laid flat by a quarter turn
    // about x — one way for the floor, the other for the ceiling, so that each
    // has its front towards the inside of the room.
    face(length, width, { position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0] }),
    face(length, width, { position: [0, height, 0], rotation: [Math.PI / 2, 0, 0] }),

    // The long walls, either side of the string.
    face(length, height, { position: [0, half, -bounds.acrossString] }),
    face(length, height, { position: [0, half, bounds.acrossString], rotation: [0, Math.PI, 0] }),

    // The ends, behind the cups.
    face(width, height, { position: [-bounds.alongString, half, 0], rotation: [0, Math.PI / 2, 0] }),
    face(width, height, { position: [bounds.alongString, half, 0], rotation: [0, -Math.PI / 2, 0] }),
  )

  geometry.computeVertexNormals()
  tintPanels(geometry)
  return geometry
}

/** How many panels fit across a run of `size`, at least one. */
function segments(size: number): number {
  return Math.max(1, Math.round(size / PANEL))
}
