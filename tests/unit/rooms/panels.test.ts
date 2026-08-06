import { describe, expect, test } from 'vitest'
import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { tintOf, tintPanels, TINT_MAX, TINT_MIN } from '../../../src/rooms/svr/panels'
import { positionsOf } from '../../../src/shape/merge'

/** The shell as the room builds it: loose triangles, no index. */
function looseTriangles(radius = 9, detail = 2): BufferGeometry {
  const geometry = new BufferGeometry()
  const solid = new IcosahedronGeometry(radius, detail)
  geometry.setAttribute('position', new Float32BufferAttribute(positionsOf(solid), 3))
  solid.dispose()
  return geometry
}

/** The tint given to the face starting at `corner`. */
function tintAt(geometry: BufferGeometry, corner: number): number {
  return geometry.getAttribute('color').getX(corner)
}

/**
 * Every pair of faces that share an edge, as the corner each one starts at.
 *
 * Found by position rather than by index, because the shell is loose triangles
 * with no index to share — two faces are neighbours when two of their corners
 * land on the same points.
 */
function facesSharingAnEdge(geometry: BufferGeometry): [number, number][] {
  const position = geometry.getAttribute('position')
  const key = (corner: number) =>
    [position.getX(corner), position.getY(corner), position.getZ(corner)]
      .map((value) => value.toFixed(4))
      .join()

  const edges = new Map<string, number[]>()
  for (let corner = 0; corner < position.count; corner += 3) {
    const corners = [key(corner), key(corner + 1), key(corner + 2)]
    for (let edge = 0; edge < 3; edge++) {
      const both = [corners[edge], corners[(edge + 1) % 3]].sort().join('|')
      edges.set(both, [...(edges.get(both) ?? []), corner])
    }
  }

  return [...edges.values()]
    .filter((faces) => faces.length === 2)
    .map(([one, other]) => [one, other] as [number, number])
}

describe('what tone a panel takes', () => {
  test('always within the range it promises', () => {
    for (let i = 0; i < 400; i++) {
      const direction = new Vector3(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 0.3)).normalize()
      const tint = tintOf(direction.x, direction.y, direction.z)

      expect(tint).toBeGreaterThanOrEqual(TINT_MIN)
      expect(tint).toBeLessThanOrEqual(TINT_MAX)
    }
  })

  test('the same panel gets the same tone every time', () => {
    // The geometry is rebuilt on entering the room. Were this random, the walls
    // would be repainted between visits.
    expect(tintOf(0.3, -0.5, 0.81)).toBe(tintOf(0.3, -0.5, 0.81))
  })

  test('the range straddles the base colour rather than only darkening it', () => {
    expect(TINT_MIN).toBeLessThan(1)
    expect(TINT_MAX).toBeGreaterThan(1)
  })

  test('the spread is subtle enough to still be one material', () => {
    // Past about a third either way the shell stops reading as a surface and
    // starts reading as a patchwork of different things.
    expect(TINT_MAX - TINT_MIN).toBeLessThan(0.5)
  })
})

describe('tinting a shell', () => {
  test('every corner of the mesh gets a colour', () => {
    const geometry = looseTriangles()
    tintPanels(geometry)

    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count)
  })

  test('a panel is one flat tone, not a gradient across it', () => {
    // The whole point. Tinted per corner instead, the values blend across each
    // face and the tessellation smears back into the featureless wash this is
    // here to fix.
    const geometry = looseTriangles()
    tintPanels(geometry)
    const colours = geometry.getAttribute('color')

    for (let corner = 0; corner < colours.count; corner += 3) {
      expect(colours.getX(corner + 1)).toBe(colours.getX(corner))
      expect(colours.getX(corner + 2)).toBe(colours.getX(corner))
    }
  })

  test('grey, so a panel is lighter or darker and never a different colour', () => {
    const geometry = looseTriangles()
    tintPanels(geometry)
    const colours = geometry.getAttribute('color')

    for (let corner = 0; corner < colours.count; corner++) {
      expect(colours.getY(corner)).toBe(colours.getX(corner))
      expect(colours.getZ(corner)).toBe(colours.getX(corner))
    }
  })

  test('panels that actually touch are nearly always tellable apart', () => {
    // What gives the surface its scale, and it has to be measured across shared
    // edges — panels next to each other in the buffer are not necessarily next
    // to each other on the shell.
    //
    // Two independent draws from a range this wide land within 0.02 of each
    // other about a ninth of the time, so a hash cannot do better than roughly
    // 0.89 here and the bound is set from that rather than from a wish. The
    // collisions cost one invisible seam apiece, which is not worth a scheme
    // that has to know what its neighbours were given.
    const geometry = looseTriangles()
    tintPanels(geometry)

    const pairs = facesSharingAnEdge(geometry)
    expect(pairs.length, 'no adjacent faces found — the fixture is wrong').toBeGreaterThan(100)

    const distinct = pairs.filter(
      ([one, other]) => Math.abs(tintAt(geometry, one) - tintAt(geometry, other)) > 0.02,
    )

    expect(distinct.length / pairs.length).toBeGreaterThan(0.8)
  })

  test('the shell as a whole stays about as bright as its base colour', () => {
    // Skewed, the room would come out uniformly darker or lighter than it was
    // lit to be, and the lighting would have to be retuned around the mottling.
    const geometry = looseTriangles()
    tintPanels(geometry)
    const colours = geometry.getAttribute('color')

    let total = 0
    for (let corner = 0; corner < colours.count; corner++) total += colours.getX(corner)

    expect(total / colours.count).toBeCloseTo((TINT_MIN + TINT_MAX) / 2, 1)
  })

  test('refuses an indexed mesh rather than tinting it wrongly', () => {
    // Corners are shared there, so a face cannot own the ones it uses — the
    // tints would bleed between neighbours and quietly produce the gradient
    // this is meant to avoid. SphereGeometry rather than an icosahedron:
    // three builds polyhedra as loose triangles, so an icosahedron would have
    // sailed through this and proved nothing.
    const indexed = new SphereGeometry(9, 8, 6)
    expect(indexed.getIndex(), 'the fixture is not actually indexed').not.toBeNull()

    expect(() => tintPanels(indexed)).toThrow(/unindexed/)
  })
})
