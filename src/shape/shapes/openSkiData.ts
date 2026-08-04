import { IcosahedronGeometry, OctahedronGeometry, Vector3, type BufferGeometry } from 'three'
import { merge, placement, positionsOf } from '../merge'

const SHELL_RADIUS = 0.66

/**
 * The twelve corners of an icosahedron of the given radius.
 *
 * Derived rather than read back off the geometry: the nodes have to land on
 * the shell's own corners for the shape to read as a graph, and matching them
 * by construction is steadier than matching them by floating-point luck.
 */
function icosahedronVertices(radius: number): Vector3[] {
  const phi = (1 + Math.sqrt(5)) / 2

  return [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ].map(([x, y, z]) => new Vector3(x, y, z).setLength(radius))
}

/**
 * The registry as what it actually is: places, and the edges between them.
 * A sparse shell so the wireframe stays a graph rather than becoming a ball of
 * lines, with a node sitting on every one of its corners.
 */
export function openSkiDataShape(): BufferGeometry {
  const shell = new IcosahedronGeometry(SHELL_RADIUS, 0)
  const node = new OctahedronGeometry(0.09)

  const nodes = icosahedronVertices(SHELL_RADIUS).map((corner) =>
    positionsOf(node, placement({ position: [corner.x, corner.y, corner.z] })),
  )

  return merge(positionsOf(shell), ...nodes)
}
