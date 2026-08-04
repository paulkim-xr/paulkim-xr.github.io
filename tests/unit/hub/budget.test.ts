import { describe, expect, test } from 'vitest'
import { BoxGeometry, OctahedronGeometry } from 'three'
import { bufferSizeFor, vertexCount } from '../../../src/hub/budget'
import { rooms } from '../../../src/content/registry'

describe('vertexCount', () => {
  test('counts distinct positions, not drawn ones', () => {
    // A box draws 36 vertices but has only 8 corners.
    expect(vertexCount(new BoxGeometry(1, 1, 1))).toBe(8)
  })
})

describe('bufferSizeFor', () => {
  test('is the largest shape, so no morph can overrun the buffer', () => {
    const shapes = [() => new OctahedronGeometry(1), () => new BoxGeometry(1, 1, 1)]
    expect(bufferSizeFor(shapes)).toBe(8)
  })

  test('holds every registered project shape', () => {
    const size = bufferSizeFor(rooms.map((room) => room.shape))

    for (const room of rooms) {
      // WigglyGeometry pads each frame's positions out to the buffer size and
      // never reallocates. A shape larger than the buffer would compute a
      // negative pad length and throw mid-morph, not degrade.
      expect(vertexCount(room.shape()), room.id).toBeLessThanOrEqual(size)
    }
  })

  test('stays small enough that per-frame padding is not the frame budget', () => {
    // 72Hz on a Quest 2: every vertex in the buffer is rewritten every frame,
    // whether the shape uses it or not.
    expect(bufferSizeFor(rooms.map((room) => room.shape))).toBeLessThan(1000)
  })

  test('an empty registry asks for no buffer at all', () => {
    expect(bufferSizeFor([])).toBe(0)
  })
})
