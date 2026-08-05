import { IcosahedronGeometry, Vector3, type BufferGeometry } from 'three'
import { merge, positionsOf } from '../merge'

/**
 * Which way the shell is cut open.
 *
 * Deliberately off every axis, so the opening is never edge-on or square to the
 * viewer as the hub turns — a window you only see as a straight line for half
 * the rotation is not much of a window.
 */
const OPENING_AXIS = new Vector3(0.42, 0.34, 0.84).normalize()
/** Half-angle of the cut, in radians. Wide enough to see the core through. */
const OPENING = 0.72

/**
 * A tessellated shell with a wedge cut out of it and something asymmetric
 * suspended inside: the spherical viewing room, as an object.
 *
 * The cut is what makes this a shape rather than a ball. It says the sphere is
 * something you get inside rather than something you look at, it shows the core
 * the room is built around, and — since it is the hub's job to tell you what a
 * room is before you commit to it — it is the difference between a preview and
 * a decoration. It also makes the silhouette asymmetric, so the idle spin reads
 * as rotation rather than as a still frame.
 */
export function svrShape(): BufferGeometry {
  return merge(positionsOf(shellGeometry(0.95, 1, true)), positionsOf(coreGeometry(0.3)))
}

/**
 * The shell, as a sphere of near-uniform triangles.
 *
 * Icosahedral rather than the usual bands of latitude and longitude. A UV
 * sphere crowds its quads together at the two poles, which are exactly the
 * places a viewer walking the inside will cross; the subdivided icosahedron has
 * no poles and no preferred axis, so the tessellation looks the same wherever
 * you happen to be standing on it.
 *
 * `cutOpen` takes a wedge out. That is for the hub, where the shell has to show
 * what is inside it — from *within* the room the same cut is a hole in the
 * wall, and reads as a piece of the world failing to draw rather than as a
 * window.
 */
export function shellGeometry(radius: number, detail: number, cutOpen = false): BufferGeometry {
  const solid = new IcosahedronGeometry(radius, detail)
  const positions = positionsOf(solid)
  solid.dispose()

  if (!cutOpen) return merge(positions)

  const kept: number[] = []
  const centroid = new Vector3()

  // Whole triangles, by where their middle points. Cutting by vertex instead
  // would leave torn triangles hanging off the rim of the opening.
  for (let start = 0; start < positions.length; start += 9) {
    centroid
      .set(
        positions[start] + positions[start + 3] + positions[start + 6],
        positions[start + 1] + positions[start + 4] + positions[start + 7],
        positions[start + 2] + positions[start + 5] + positions[start + 8],
      )
      .normalize()

    if (centroid.angleTo(OPENING_AXIS) < OPENING) continue
    kept.push(...positions.slice(start, start + 9))
  }

  return merge(kept)
}

/**
 * The object the room is built around: a small solid with its vertices pushed
 * out by differing amounts.
 *
 * Asymmetric on purpose, and the point of the whole room. Walking around
 * something that looks the same from every angle earns the viewer nothing, so
 * whatever sits at the centre has to have a silhouette that changes as they go.
 */
export function coreGeometry(radius: number, detail = 1): BufferGeometry {
  const solid = new IcosahedronGeometry(radius, detail)
  const position = solid.getAttribute('position')
  const vertex = new Vector3()

  // Keyed on direction rather than vertex index, so every copy of a shared
  // corner is displaced identically and the surface does not tear open.
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index)
    vertex.multiplyScalar(reachOf(vertex, radius))
    position.setXYZ(index, vertex.x, vertex.y, vertex.z)
  }

  const positions = positionsOf(solid)
  solid.dispose()
  return merge(positions)
}

/**
 * How far out a corner is pushed, from the direction it points in.
 *
 * A hash rather than a random number: the hub rebuilds this geometry on every
 * morph, and a core that came back a different shape each time would flicker
 * between them.
 */
function reachOf(vertex: Vector3, radius: number): number {
  const seed = Math.sin(
    (vertex.x / radius) * 12.9898 + (vertex.y / radius) * 78.233 + (vertex.z / radius) * 37.719,
  )
  const noise = seed * 43758.5453
  return 0.62 + (noise - Math.floor(noise)) * 0.83
}
