import { BufferGeometry, type BufferAttribute, type InterleavedBufferAttribute } from 'three'

/**
 * A view of someone else's moving vertices, connected up its own way.
 *
 * WigglyGeometry draws a morph with whichever of the two shapes has *more*
 * triangles and swaps to the destination's topology only once every vertex has
 * landed — its own comment calls this "fix later when the transform is over".
 * The result is that a morph into a simpler shape is drawn with the departing
 * shape's faces the whole way, and then loses the surplus ones in a single
 * frame at the end.
 *
 * A topology is one half of the fix: two of these share the morph's position
 * attribute — the same buffer, uploaded once — and differ only in which
 * triangles they connect. Cross-fading them turns that snap into a dissolve.
 */
export function createTopology(): BufferGeometry {
  return new BufferGeometry()
}

/**
 * Points a topology at a position buffer and a set of triangles.
 *
 * `version` must increase every time: three caches one wireframe index per
 * geometry and rebuilds it only when the index attribute's version is higher
 * than the version it last built at. A swapped-in index attribute starts at
 * zero, so without this the wireframe silently keeps the previous topology —
 * which is the very thing this module exists to change.
 */
export function bindTopology(
  target: BufferGeometry,
  position: BufferAttribute | InterleavedBufferAttribute,
  index: BufferAttribute | null,
  version: number,
): void {
  if (!index) return

  target.setAttribute('position', position)
  target.setIndex(index)
  target.setDrawRange(0, index.count)
  index.version = version
}

/**
 * Releases a topology without freeing the vertices it was borrowing.
 *
 * Disposing a geometry frees the GPU buffers of every attribute on it, and the
 * position attribute here belongs to the morph, which may still be drawing it.
 */
export function releaseTopology(target: BufferGeometry): void {
  target.deleteAttribute('position')
  target.dispose()
}
