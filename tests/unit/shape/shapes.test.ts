import { describe, expect, test } from 'vitest'
import { Sphere, type BufferGeometry } from 'three'
import { rooms } from '../../../src/content/registry'
import { papercupShape } from '../../../src/shape/shapes/papercup'

/**
 * The hub camera frames a shape of roughly this reach. A shape that grew past
 * it would be clipped off-screen at the hub with nothing to say why, so the
 * bound is asserted rather than left to whoever adds the next project.
 */
const MAX_RADIUS = 1

function boundingSphereOf(geometry: BufferGeometry): Sphere {
  geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere
  if (!sphere) throw new Error('geometry has no bounding sphere')
  return sphere
}

describe('project shapes', () => {
  test.each(rooms.map((room) => [room.id, room.shape] as const))(
    '%s builds a non-empty geometry of finite positions',
    (_id, shape) => {
      const position = shape().getAttribute('position')

      expect(position.count).toBeGreaterThan(0)
      for (let index = 0; index < position.array.length; index++) {
        expect(Number.isFinite(position.array[index])).toBe(true)
      }
    },
  )

  test.each(rooms.map((room) => [room.id, room.shape] as const))(
    '%s fits inside the hub framing and is roughly centred',
    (_id, shape) => {
      const sphere = boundingSphereOf(shape())
      expect(sphere.radius).toBeLessThanOrEqual(MAX_RADIUS)
      // Off-centre shapes swing rather than spin under the hub's idle rotation.
      expect(sphere.center.length()).toBeLessThan(0.35)
    },
  )

  test.each(rooms.map((room) => [room.id, room.shape] as const))(
    '%s returns a fresh instance every call',
    (_id, shape) => {
      // The hub rewrites vertex positions in place; a shared instance would be
      // corrupted the moment a second consumer read it.
      expect(shape()).not.toBe(shape())
    },
  )

  test('every shape is deterministic — two builds agree vertex for vertex', () => {
    for (const room of rooms) {
      const first = room.shape().getAttribute('position').array
      const second = room.shape().getAttribute('position').array
      expect(Array.from(second), room.id).toEqual(Array.from(first))
    }
  })
})

/**
 * Widest reach from the X axis among the vertices lying in a slice of X.
 *
 * The cups are surfaces of revolution about X once placed, so this is the
 * radius of the cup wall at that point along its length.
 */
function radiusInSlice(geometry: BufferGeometry, from: number, to: number): number {
  const position = geometry.getAttribute('position')
  let widest = 0

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index)
    if (x < from || x > to) continue
    widest = Math.max(widest, Math.hypot(position.getY(index), position.getZ(index)))
  }

  return widest
}

describe('the paper cup telephone', () => {
  // The string is knotted through the bottom of each cup. Get the quarter turn
  // backwards and you get two funnels sharing a straw, which was the bug this
  // pins: both cups had their mouths facing inward.
  test('the cups meet base to base, with their mouths facing outward', () => {
    const geometry = papercupShape()

    // The right-hand cup runs from its base at x=0.36 to its mouth at x=0.84.
    const atBase = radiusInSlice(geometry, 0.36, 0.45)
    const atMouth = radiusInSlice(geometry, 0.75, 0.85)

    expect(atMouth).toBeGreaterThan(atBase)
  })

  test('both cups face the same way out, so the shape is symmetric about X', () => {
    const geometry = papercupShape()

    expect(radiusInSlice(geometry, -0.45, -0.36)).toBeCloseTo(radiusInSlice(geometry, 0.36, 0.45), 5)
    expect(radiusInSlice(geometry, -0.85, -0.75)).toBeCloseTo(radiusInSlice(geometry, 0.75, 0.85), 5)
  })
})
