import { describe, expect, test } from 'vitest'
import { BoxGeometry, OctahedronGeometry, Vector3 } from 'three'
import { Movement } from '../../../src/lib/morph/Movement'
import { WigglyGeometry } from '../../../src/lib/morph/WigglyGeometry'

const BUFFER = 2000

describe('Movement', () => {
  test('a stationary movement stays at its origin', () => {
    const movement = new Movement({ origin: new Vector3(1, 2, 3) }).stationary()
    expect(movement.getCurrentPoint(0).toArray()).toEqual([1, 2, 3])
    expect(movement.getCurrentPoint(5).toArray()).toEqual([1, 2, 3])
  })

  test('a one-shot path ends at its destination and stays there', () => {
    const origin = new Vector3(0, 0, 0)
    const destination = new Vector3(10, 0, 0)
    const movement = new Movement({
      origin,
      paths: [new Vector3(), destination.clone()],
      loop: false,
    })

    const end = movement.getCurrentPoint(movement.totalTime + 1)
    expect(end.x).toBeCloseTo(10)
  })

  test('interpolates between origin and destination part-way through', () => {
    const movement = new Movement({
      origin: new Vector3(),
      paths: [new Vector3(), new Vector3(10, 0, 0)],
      loop: false,
    })

    const mid = movement.getCurrentPoint(movement.totalTime / 2)
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(10)
  })
})

describe('WigglyGeometry', () => {
  test('deduplicates shared vertices into an indexed geometry', () => {
    // A box has 24 position entries but only 8 distinct corners.
    const indexed = WigglyGeometry.toIndexed(new BoxGeometry(1, 1, 1))
    expect(indexed.userData.vertices).toHaveLength(8 * 3)
  })

  test('pads the position attribute to a fixed buffer size', () => {
    const indexed = WigglyGeometry.toIndexed(new BoxGeometry(1, 1, 1), BUFFER)
    // A fixed-size buffer means the attribute is never reallocated mid-morph.
    expect(indexed.attributes.position.count).toBe(BUFFER)
  })

  test('constructs from a geometry and reports itself mid-transition', () => {
    const geometry = new WigglyGeometry({
      geometry: new BoxGeometry(1, 1, 1),
      startTime: 0,
      bufferSize: BUFFER,
    })
    expect(geometry.onTransition).toBe(true)
  })

  test('transformTo morphs toward a different shape and settles', () => {
    const geometry = new WigglyGeometry({
      geometry: new BoxGeometry(1, 1, 1),
      startTime: 0,
      bufferSize: BUFFER,
      transitionTime: 1,
    })

    // Let the initial transition finish.
    geometry.updateVertices(2)
    expect(geometry.onTransition).toBe(false)

    geometry.transformTo(new OctahedronGeometry(1), 2, false)
    expect(geometry.onTransition).toBe(true)

    geometry.updateVertices(2.5)
    const midway = geometry.getVertexCurrentPosition(0)!.clone()

    geometry.updateVertices(4)
    expect(geometry.onTransition).toBe(false)

    const settled = geometry.getVertexCurrentPosition(0)!
    expect(settled.distanceTo(midway)).toBeGreaterThan(0)
    // An octahedron of radius 1 has every vertex on the unit sphere.
    expect(settled.length()).toBeCloseTo(1, 5)
  })

  test('handles morphing between shapes with different vertex counts', () => {
    const geometry = new WigglyGeometry({
      geometry: new OctahedronGeometry(1), // 6 vertices
      startTime: 0,
      bufferSize: BUFFER,
      transitionTime: 1,
    })
    geometry.updateVertices(2)

    // 8 corners: more vertices than the shape being left behind.
    expect(() => geometry.transformTo(new BoxGeometry(1, 1, 1), 2, false)).not.toThrow()
    geometry.updateVertices(4)
    expect(geometry.onTransition).toBe(false)
  })
})
