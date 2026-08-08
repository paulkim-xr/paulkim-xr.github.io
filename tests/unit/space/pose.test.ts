import { describe, expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { orientationOf } from '../../../src/space/pose'

/** Where a camera holding `orientation` is looking, and which way its head is. */
const forwardOf = (orientation: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(orientation)
const upOf = (orientation: Quaternion) => new Vector3(0, 1, 0).applyQuaternion(orientation)

describe('an orientation built from a facing and an up', () => {
  test('looks the way it was told to face', () => {
    // A camera's forward is its own −Z. If this is backwards the whole room
    // renders behind the viewer, which is the least subtle bug available.
    const orientation = orientationOf(new Vector3(0, 0, -1), new Vector3(0, 1, 0))
    expect(forwardOf(orientation).distanceTo(new Vector3(0, 0, -1))).toBeCloseTo(0, 9)
  })

  test('keeps its head where it was told', () => {
    const orientation = orientationOf(new Vector3(1, 0, 0), new Vector3(0, 1, 0))
    expect(upOf(orientation).distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(0, 9)
  })

  test('works where up is not world up', () => {
    // The case the sphere room needs: standing inside a shell, up points at
    // the centre and is different at every point on the surface.
    const facing = new Vector3(0, 1, 0)
    const up = new Vector3(0, 0, -1)
    const orientation = orientationOf(facing, up)

    expect(forwardOf(orientation).distanceTo(facing)).toBeCloseTo(0, 9)
    expect(upOf(orientation).distanceTo(up)).toBeCloseTo(0, 9)
  })

  test('is unit length, so it never scales the scene', () => {
    const orientation = orientationOf(new Vector3(2, 3, -4), new Vector3(0, 5, 0))
    expect(orientation.length()).toBeCloseTo(1, 12)
  })

  test('does not modify the vectors it was given', () => {
    const facing = new Vector3(0, 0, -3)
    orientationOf(facing, new Vector3(0, 2, 0))
    expect(facing.z).toBe(-3)
  })
})
