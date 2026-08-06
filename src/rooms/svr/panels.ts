import { Float32BufferAttribute, Vector3, type BufferGeometry } from 'three'

/**
 * How much lighter or darker than the base a panel can be.
 *
 * Wide enough that neighbours are always tellable apart, narrow enough that the
 * shell still reads as one material rather than as a patchwork.
 */
export const TINT_MIN = 0.8
export const TINT_MAX = 1.16

/**
 * How much the tint a panel is given varies, as a fraction either side of one.
 *
 * The room's problem before this was that a sphere lit from inside has almost
 * no shading to offer: adjacent facets are very nearly parallel, so they take
 * very nearly the same light, and the surface underfoot came out as a flat wash
 * with no scale and nothing to stand on. Giving each panel a tone of its own
 * puts the tessellation back without drawing a single line — which matters,
 * because lines are what this room stopped using.
 */
export function tintOf(x: number, y: number, z: number): number {
  // A hash, not a random number: the geometry is rebuilt whenever the room is
  // entered, and a shell that came back differently mottled each time would
  // read as the walls being repainted between visits.
  const seed = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  const fraction = seed - Math.floor(seed)
  return TINT_MIN + fraction * (TINT_MAX - TINT_MIN)
}

/**
 * Gives every triangle of `geometry` a tone of its own.
 *
 * Whole panels, flat: all three corners of a face take the same value, so each
 * one is a single tone against its neighbours. Per-corner instead and the tints
 * would blend across each face into a smear, which is the featureless wash this
 * exists to fix.
 *
 * Requires loose triangles rather than an indexed mesh — corners have to belong
 * to exactly one face for a face to be able to colour them.
 */
export function tintPanels(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position')
  if (geometry.getIndex() !== null) {
    throw new Error('tintPanels needs unindexed triangles: shared corners cannot be tinted per face')
  }

  const colours = new Float32Array(position.count * 3)
  const centroid = new Vector3()

  for (let corner = 0; corner < position.count; corner += 3) {
    centroid
      .set(
        position.getX(corner) + position.getX(corner + 1) + position.getX(corner + 2),
        position.getY(corner) + position.getY(corner + 1) + position.getY(corner + 2),
        position.getZ(corner) + position.getZ(corner + 1) + position.getZ(corner + 2),
      )
      // Keyed on the direction the panel lies in rather than on its index, so
      // the pattern belongs to the shape and not to the order it was built in.
      .normalize()

    const tint = tintOf(centroid.x, centroid.y, centroid.z)
    for (let offset = 0; offset < 3; offset++) {
      colours.set([tint, tint, tint], (corner + offset) * 3)
    }
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
}
