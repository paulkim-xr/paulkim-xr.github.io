import { describe, expect, test } from 'vitest'
import {
  BoxGeometry,
  CurvePath,
  LineCurve3,
  OctahedronGeometry,
  TetrahedronGeometry,
  Vector3,
} from 'three'
import { Movement } from '../../../src/lib/morph/Movement'
import { WigglyGeometry } from '../../../src/lib/morph/WigglyGeometry'

const BUFFER = 256

function settled(startShape = new BoxGeometry(1, 1, 1)): WigglyGeometry {
  const geometry = new WigglyGeometry({
    geometry: startShape,
    startTime: 0,
    bufferSize: BUFFER,
    transitionTime: 1,
  })
  geometry.updateVertices(2)
  return geometry
}

describe('Movement path construction', () => {
  test('accepts a CurvePath as well as a list of points', () => {
    const path = new CurvePath<Vector3>()
    path.add(new LineCurve3(new Vector3(), new Vector3(1, 0, 0)))

    const movement = new Movement({ paths: path, loop: false })

    expect(movement.paths.curves).toHaveLength(1)
    expect(movement.totalTime).toBeGreaterThan(0)
  })

  test('a list of n points becomes n-1 straight segments', () => {
    const movement = new Movement({
      paths: [new Vector3(), new Vector3(1, 0, 0), new Vector3(1, 1, 0)],
    })
    expect(movement.paths.curves).toHaveLength(2)
  })

  test('rejects a path that is neither a curve nor a point', () => {
    const movement = new Movement({ paths: [] })
    expect(() => movement.add('nowhere' as unknown as Vector3)).toThrow(/Invalid path type/)
  })

  test('rejects a paths collection that is neither a CurvePath nor an array', () => {
    const movement = new Movement({ paths: [] })
    expect(() => movement.addPaths(42 as unknown as Vector3[])).toThrow(/Invalid paths type/)
  })

  test('addPaths accepts a CurvePath and appends every curve in it', () => {
    const source = new CurvePath<Vector3>()
    source.add(new LineCurve3(new Vector3(), new Vector3(1, 0, 0)))
    source.add(new LineCurve3(new Vector3(1, 0, 0), new Vector3(1, 1, 0)))

    const movement = new Movement({ paths: [] }).addPaths(source)

    expect(movement.paths.curves).toHaveLength(2)
  })

  test('removing a segment shortens the movement in time as well as space', () => {
    const movement = new Movement({
      paths: [new Vector3(), new Vector3(1, 0, 0), new Vector3(2, 0, 0)],
    })
    const before = movement.totalTime

    expect(movement.remove()).toBeDefined()

    expect(movement.paths.curves).toHaveLength(1)
    expect(movement.totalTime).toBeLessThan(before)
  })

  test('removing by index rejects an index that is not there', () => {
    const movement = new Movement({ paths: [new Vector3(), new Vector3(1, 0, 0)] })
    expect(() => movement.remove(7)).toThrow(/Invalid index/)
  })

  test('removeRange clears the segments it is given', () => {
    const movement = new Movement({
      paths: [new Vector3(), new Vector3(1, 0, 0), new Vector3(2, 0, 0), new Vector3(3, 0, 0)],
    })
    movement.removeRange(0)
    expect(movement.paths.curves).toHaveLength(0)
  })

  test('a closed, non-looping walk finishes where it started', () => {
    const start = new Vector3(0.2, 0, 0)
    const movement = new Movement({
      paths: [start.clone(), new Vector3(1, 0, 0), new Vector3(0.5, 1, 0)],
      closed: true,
      loop: false,
    })

    const end = movement.getCurrentPoint(movement.totalTime + 1)

    expect(end.distanceTo(start)).toBeCloseTo(0, 5)
    expect(movement.finished).toBe(true)
  })

  test('closing an already-closed walk changes nothing', () => {
    const movement = new Movement({ paths: [new Vector3(), new Vector3(1, 0, 0)], closed: true })
    const segments = movement.paths.curves.length

    movement.closePath()

    expect(movement.paths.curves).toHaveLength(segments)
  })

  test('dof caps how far a random walk may wander from its origin', () => {
    const origin = new Vector3(3, 0, 0)
    const movement = new Movement({ origin, dof: 0.05 })

    for (const time of [0, 1.5, 7, 33]) {
      expect(movement.getCurrentPoint(time).distanceTo(origin)).toBeLessThanOrEqual(0.05 + 1e-6)
    }
  })
})

describe('WigglyGeometry buffer discipline', () => {
  test('reports no vertex outside the shape it currently holds', () => {
    const geometry = settled()
    expect(geometry.getVertex(-1)).toBeUndefined()
    expect(geometry.getVertex(geometry.vertices.length / 3)).toBeUndefined()
  })

  test('reports no live position outside the allocated buffer', () => {
    const geometry = settled()
    expect(geometry.getVertexCurrentPosition(-1)).toBeUndefined()
    expect(geometry.getVertexCurrentPosition(BUFFER)).toBeUndefined()
  })

  test('setGeometry swaps the resident shape without resizing the buffer', () => {
    const geometry = settled()

    geometry.setGeometry(new TetrahedronGeometry(1))

    expect(geometry.vertices).toHaveLength(4 * 3)
    expect(geometry.attributes.position.count).toBe(BUFFER)
  })
})

describe('WigglyGeometry morph control', () => {
  test('a morph interrupted by another still settles on the last shape asked for', () => {
    const geometry = settled()

    geometry.transformTo(new OctahedronGeometry(1), 2, false)
    // Interrupt halfway: the second morph must start from where the vertices
    // actually are, not from where the first morph was heading.
    geometry.updateVertices(2.5)
    geometry.transformTo(new TetrahedronGeometry(1), 2.5, false)

    geometry.updateVertices(4)

    expect(geometry.onTransition).toBe(false)
    expect(geometry.vertices).toHaveLength(4 * 3)
    // A tetrahedron of radius 1 puts every vertex on the unit sphere.
    expect(geometry.getVertexCurrentPosition(0)?.length()).toBeCloseTo(1, 5)
  })

  test('asking for random idle movement leaves the surface near the shape', () => {
    const geometry = settled()

    geometry.transformTo(new OctahedronGeometry(1), 2, true)
    geometry.updateVertices(4)

    // Movement's default dof is 0.3, so a settled vertex sits within that of
    // the unit sphere the octahedron's corners lie on.
    const drift = Math.abs((geometry.getVertexCurrentPosition(0)?.length() ?? 0) - 1)
    expect(drift).toBeLessThanOrEqual(0.3 + 1e-6)
  })

  test('explicit movements are used as given', () => {
    const geometry = settled()
    const parked = new Movement({ origin: new Vector3(5, 0, 0) }).stationary()

    geometry.transformTo(new TetrahedronGeometry(1), 2, [parked])
    geometry.updateVertices(4)

    expect(geometry.getVertexCurrentPosition(0)?.x).toBeCloseTo(5, 5)
  })

  test('pausing the wiggle and resuming leaves the surface exactly where it was', () => {
    const geometry = settled()
    geometry.transformTo(new OctahedronGeometry(1), 0, true)

    geometry.updateVertices(10)
    const held = geometry.getVertexCurrentPosition(0)?.clone()

    // Paused: no update at all, so the buffer keeps the frame it had.
    geometry.updateVertices(10, false)
    expect(geometry.getVertexCurrentPosition(0)?.distanceTo(held!)).toBe(0)

    // Five seconds later the paused span is discounted, so the walk picks up
    // from the same point rather than jumping to where it would have got to.
    geometry.updateVertices(15, true)
    expect(geometry.getVertexCurrentPosition(0)?.distanceTo(held!)).toBeCloseTo(0, 5)
  })
})
