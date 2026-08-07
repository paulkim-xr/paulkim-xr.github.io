import { describe, expect, test } from 'vitest'
import { Box3, BufferGeometry, Vector3 } from 'three'
import { corridorGeometry } from '../../../src/rooms/papercup/corridor'
import type { Bounds } from '../../../src/rooms/papercup/stroll'

const ROOM: Bounds = { alongString: 11, acrossString: 2.6 }
const HEIGHT = 4.2

const built = (): BufferGeometry => corridorGeometry(ROOM, HEIGHT)

/** How many corners of the mesh sit on the plane `axis = value`. */
function cornersOn(geometry: BufferGeometry, axis: 'x' | 'y' | 'z', value: number): number {
  const position = geometry.getAttribute('position')
  let found = 0
  for (let corner = 0; corner < position.count; corner++) {
    const at = new Vector3().fromBufferAttribute(position, corner)
    if (Math.abs(at[axis] - value) < 1e-6) found++
  }
  return found
}

describe('the box the room is', () => {
  test('is exactly the size it was asked for', () => {
    // The room the walls draw is the room the walking is bounded against — the
    // viewer is held a little inside these, so that they stop short of the wall
    // rather than with an eye in it, but the wall itself goes here.
    const bounds = new Box3().setFromBufferAttribute(
      built().getAttribute('position') as never,
    )

    expect(bounds.min.x).toBeCloseTo(-ROOM.alongString, 5)
    expect(bounds.max.x).toBeCloseTo(ROOM.alongString, 5)
    expect(bounds.min.z).toBeCloseTo(-ROOM.acrossString, 5)
    expect(bounds.max.z).toBeCloseTo(ROOM.acrossString, 5)
    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeCloseTo(HEIGHT, 5)
  })

  test('has a floor to stand on and a ceiling over it', () => {
    const geometry = built()
    expect(cornersOn(geometry, 'y', 0)).toBeGreaterThan(0)
    expect(cornersOn(geometry, 'y', HEIGHT)).toBeGreaterThan(0)
  })

  test('is closed at both ends', () => {
    // Not a corridor running off into the dark. Nothing leaves this room, which
    // is the whole of what the project is about, so it has to be a box and not
    // a tube.
    const geometry = built()
    expect(cornersOn(geometry, 'x', -ROOM.alongString)).toBeGreaterThan(0)
    expect(cornersOn(geometry, 'x', ROOM.alongString)).toBeGreaterThan(0)
  })

  test('has walls down both sides', () => {
    const geometry = built()
    expect(cornersOn(geometry, 'z', -ROOM.acrossString)).toBeGreaterThan(0)
    expect(cornersOn(geometry, 'z', ROOM.acrossString)).toBeGreaterThan(0)
  })
})

describe('what it is made of', () => {
  test('loose triangles, so every panel can take its own tone', () => {
    const geometry = built()
    expect(geometry.getIndex()).toBeNull()
    expect(geometry.getAttribute('position').count % 3).toBe(0)
  })

  test('every wall faces into the room', () => {
    // What the material has to agree with, and it is not obvious which way
    // round it should be: the sphere room next door is a shell built facing
    // outwards and seen from inside, so it draws its back faces. This box is
    // built facing inwards. Rendered the same way as the sphere, every wall is
    // culled and the viewer stands in an unlit void with a string hanging in
    // it — which is exactly what happened.
    const geometry = built()
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')

    for (let corner = 0; corner < position.count; corner += 3) {
      const at = new Vector3().fromBufferAttribute(position, corner)
      const facing = new Vector3().fromBufferAttribute(normal, corner)
      // From a point on the wall towards the middle of the room, at head
      // height — where the viewer actually is.
      const inwards = new Vector3(0, HEIGHT / 2, 0).sub(at)

      expect(facing.dot(inwards), `a wall at ${at.toArray()} faces away from the room`)
        .toBeGreaterThan(0)
    }
  })

  test('arrives already tinted and already lit', () => {
    const geometry = built()
    expect(geometry.getAttribute('color'), 'no panel tones').toBeDefined()
    expect(geometry.getAttribute('normal'), 'nothing to light it by').toBeDefined()
  })

  test('panelled at something like a human scale', () => {
    // A wall of two enormous triangles gives a viewer nothing to judge the
    // size of the room by. Rough bounds either side of one panel per metre.
    const faces = built().getAttribute('position').count / 3
    const area = 2 * (2 * ROOM.alongString * 2 * ROOM.acrossString) + 0
    expect(faces).toBeGreaterThan(area / 2)
    expect(faces).toBeLessThan(20000)
  })

  test('a smaller room is a smaller mesh', () => {
    const small = corridorGeometry({ alongString: 4, acrossString: 1.5 }, HEIGHT)
    expect(small.getAttribute('position').count).toBeLessThan(
      built().getAttribute('position').count,
    )
  })

  test('a room narrower than one panel still has walls', () => {
    // The panel count rounds, and rounding to zero would leave a face missing
    // altogether rather than merely coarse.
    const sliver = corridorGeometry({ alongString: 0.2, acrossString: 0.1 }, 0.3)
    expect(sliver.getAttribute('position').count).toBeGreaterThan(0)
  })
})
