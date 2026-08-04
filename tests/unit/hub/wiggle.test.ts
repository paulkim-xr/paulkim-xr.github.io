import { describe, expect, test } from 'vitest'
import { BoxGeometry, OctahedronGeometry, Vector3 } from 'three'
import { WigglyGeometry } from '../../../src/lib/morph/WigglyGeometry'
import { WIGGLE_DOF, wiggleMoves } from '../../../src/hub/wiggle'

const BUFFER = 64

function settled(geometry = new BoxGeometry(1, 1, 1)): WigglyGeometry {
  const wiggly = new WigglyGeometry({ geometry, startTime: 0, bufferSize: BUFFER, transitionTime: 1 })
  wiggly.updateVertices(2)
  return wiggly
}

describe('wiggleMoves', () => {
  test('produces one movement per vertex of the current shape', () => {
    const geometry = settled()
    expect(wiggleMoves(geometry)).toHaveLength(geometry.vertices.length / 3)
  })

  test('every movement stays within its degree of freedom of its vertex', () => {
    const geometry = settled()
    const moves = wiggleMoves(geometry)

    moves.forEach((move, index) => {
      const origin = geometry.getVertex(index) ?? new Vector3()
      // Waypoints all sit inside a sphere of radius dof around the origin, and
      // the path between them is straight, so the whole walk stays inside it.
      for (const time of [0, 0.7, 3.3, 11, 40]) {
        expect(move.getCurrentPoint(time).distanceTo(origin)).toBeLessThanOrEqual(
          WIGGLE_DOF + 1e-6,
        )
      }
    })
  })

  test('the drift is small next to the shape itself', () => {
    // A wiggle that rivals the object's own size stops reading as the object.
    expect(WIGGLE_DOF).toBeLessThan(0.05)
  })

  test('anchors to the destination shape when called after transformTo', () => {
    const geometry = settled()
    geometry.transformTo(new OctahedronGeometry(1), 2, false)

    const moves = wiggleMoves(geometry)

    // An octahedron of radius 1 puts every vertex on the unit sphere; a box's
    // corners sit at radius sqrt(3)/2. Anchoring to the shape being left
    // behind would show up here.
    expect(moves).toHaveLength(6)
    for (const move of moves) {
      expect(move.getCurrentPoint(0).length()).toBeCloseTo(1, 1)
    }
  })
})
