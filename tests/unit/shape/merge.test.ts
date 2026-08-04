import { describe, expect, test } from 'vitest'
import { BoxGeometry, OctahedronGeometry } from 'three'
import { merge, placement, positionsOf } from '../../../src/shape/merge'

describe('positionsOf', () => {
  test('flattens an indexed geometry to one triple per drawn vertex', () => {
    // A box is indexed: 8 distinct corners drawn as 36 vertices.
    const positions = positionsOf(new BoxGeometry(1, 1, 1))
    expect(positions).toHaveLength(36 * 3)
  })

  test('leaves an already non-indexed geometry alone', () => {
    const octahedron = new OctahedronGeometry(1)
    expect(octahedron.index).toBeNull()
    expect(positionsOf(octahedron)).toHaveLength(octahedron.attributes.position.count * 3)
  })

  test('applies the transform to every vertex', () => {
    const moved = positionsOf(new BoxGeometry(2, 2, 2), placement({ position: [10, 0, 0] }))

    for (let index = 0; index < moved.length; index += 3) {
      // The box spans [-1, 1]; shifted ten along X it can only span [9, 11].
      expect(moved[index]).toBeGreaterThanOrEqual(9)
      expect(moved[index]).toBeLessThanOrEqual(11)
    }
  })

  test('rotation and scale both reach the vertices', () => {
    const [x, y] = positionsOf(
      new BoxGeometry(2, 2, 2),
      placement({ rotation: [0, 0, Math.PI / 2], scale: 3 }),
    )

    // A quarter turn about Z sends +X to +Y, and the scale triples the reach.
    expect(Math.abs(x)).toBeCloseTo(3)
    expect(Math.abs(y)).toBeCloseTo(3)
  })
})

describe('merge', () => {
  test('concatenates parts into one position attribute', () => {
    const left = positionsOf(new BoxGeometry(1, 1, 1), placement({ position: [-5, 0, 0] }))
    const right = positionsOf(new BoxGeometry(1, 1, 1), placement({ position: [5, 0, 0] }))

    const merged = merge(left, right)

    expect(merged.attributes.position.count).toBe((left.length + right.length) / 3)
    merged.computeBoundingBox()
    expect(merged.boundingBox?.min.x).toBeCloseTo(-5.5)
    expect(merged.boundingBox?.max.x).toBeCloseTo(5.5)
  })

  test('produces a geometry with no index, ready to be re-indexed by hash', () => {
    expect(merge(positionsOf(new BoxGeometry(1, 1, 1))).index).toBeNull()
  })

  test('an empty merge is an empty geometry rather than a throw', () => {
    expect(merge().attributes.position.count).toBe(0)
  })
})
