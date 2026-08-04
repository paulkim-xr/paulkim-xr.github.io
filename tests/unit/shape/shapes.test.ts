import { describe, expect, test } from 'vitest'
import { Sphere, type BufferGeometry } from 'three'
import { rooms } from '../../../src/content/registry'

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
