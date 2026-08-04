import { BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three'

type Triple = readonly [number, number, number]

/**
 * A rigid placement for one part of a composite shape.
 *
 * Rotation belongs on the part, not on a parent group: the hub morphs a single
 * geometry, so there are no groups left at render time to inherit a transform.
 */
export function placement({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: {
  position?: Triple
  rotation?: Triple
  scale?: number
} = {}): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(scale, scale, scale),
  )
}

/**
 * A geometry flattened to plain world-space position triples.
 *
 * Only positions survive. WigglyGeometry re-derives its own index by hashing
 * vertex positions and never reads normals or UVs, so carrying them would cost
 * bytes and force every part to agree on an attribute set before merging.
 */
export function positionsOf(geometry: BufferGeometry, transform?: Matrix4): number[] {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const source = flat.getAttribute('position')
  const vertex = new Vector3()
  const positions: number[] = []

  for (let index = 0; index < source.count; index++) {
    vertex.fromBufferAttribute(source, index)
    if (transform) vertex.applyMatrix4(transform)
    positions.push(vertex.x, vertex.y, vertex.z)
  }

  return positions
}

/** Concatenates parts into the one geometry the hub morphs. */
export function merge(...parts: number[][]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(parts.flat(), 3))
  return geometry
}
