import type { BufferGeometry } from 'three'
import { WigglyGeometry } from '../lib/morph/WigglyGeometry'

/** Distinct vertices a shape has once shared positions are deduplicated. */
export function vertexCount(geometry: BufferGeometry): number {
  return WigglyGeometry.toIndexed(geometry).userData.vertices.length / 3
}

/**
 * The fixed position-buffer size the hub allocates, in vertices.
 *
 * WigglyGeometry never reallocates: it pads every frame's positions out to
 * this size. Too small and a morph into a denser shape overruns the buffer;
 * too large and every frame rewrites floats nothing will ever read. The
 * largest shape in the registry is therefore exactly the right answer, and
 * deriving it means adding a project can never silently overrun.
 */
export function bufferSizeFor(shapes: (() => BufferGeometry)[]): number {
  return shapes.reduce((largest, shape) => {
    const geometry = shape()
    const count = vertexCount(geometry)
    geometry.dispose()
    return Math.max(largest, count)
  }, 0)
}
