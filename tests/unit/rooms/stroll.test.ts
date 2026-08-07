import { describe, expect, test } from 'vitest'
import {
  facingOf,
  initialStroll,
  rightOf,
  strollTo,
  type Bounds,
  type Step,
  type Stroll,
} from '../../../src/rooms/papercup/stroll'

const ROOM: Bounds = { alongString: 11, acrossString: 2.6 }

const step = (over: Partial<Step> = {}): Step => ({
  forward: 0,
  sideways: 0,
  turned: 0,
  ...over,
})

/** Takes a run of steps in order. */
function walk(stroll: Stroll, ...steps: Step[]): Stroll {
  return steps.reduce((at, one) => strollTo(at, one, ROOM), stroll)
}

describe('standing in the room', () => {
  test('opens in the middle, looking down the string', () => {
    const start = initialStroll()

    expect(start.position.toArray()).toEqual([0, 0, 0])
    expect(facingOf(start).x).toBeCloseTo(1, 10)
    expect(facingOf(start).z).toBeCloseTo(0, 10)
  })

  test('facing and right hand are level, because the floor is', () => {
    // The difference from the sphere next door: nothing here can tip the viewer
    // over, so neither vector ever leaves the floor plane.
    const turned = walk(initialStroll(), step({ turned: 1.1 }))

    expect(facingOf(turned).y).toBe(0)
    expect(rightOf(turned).y).toBe(0)
  })

  test('the right hand is a quarter turn from facing', () => {
    const turned = walk(initialStroll(), step({ turned: 0.7 }))
    expect(facingOf(turned).dot(rightOf(turned))).toBeCloseTo(0, 10)
  })
})

describe('walking about', () => {
  test('forward goes the way the viewer faces', () => {
    const moved = walk(initialStroll(), step({ forward: 3 }))
    expect(moved.position.x).toBeCloseTo(3, 10)
    expect(moved.position.z).toBeCloseTo(0, 10)
  })

  test('turning first changes where forward goes', () => {
    const moved = walk(initialStroll(), step({ turned: Math.PI / 2 }), step({ forward: 2 }))

    expect(moved.position.x).toBeCloseTo(0, 10)
    expect(moved.position.z).toBeCloseTo(2, 10)
  })

  test('turning on the spot does not move the viewer', () => {
    const spun = walk(initialStroll(), step({ forward: 4 }), step({ turned: 2.2 }))
    expect(spun.position.x).toBeCloseTo(4, 10)
    expect(spun.position.z).toBeCloseTo(0, 10)
  })

  test('sideways goes across, not along', () => {
    const moved = walk(initialStroll(), step({ sideways: 1.5 }))
    expect(moved.position.x).toBeCloseTo(0, 10)
    expect(moved.position.z).toBeCloseTo(1.5, 10)
  })

  test('the viewer never leaves the floor', () => {
    const wandered = walk(
      initialStroll(),
      step({ forward: 5, turned: 0.6 }),
      step({ sideways: -2 }),
      step({ forward: 3 }),
    )
    expect(wandered.position.y).toBe(0)
  })
})

describe('the room has no way out', () => {
  test('walking at the far cup stops at the far cup', () => {
    // The project runs on your own hardware and nothing it hears leaves your
    // network. The room it gets is one you cannot walk out of.
    const pressed = walk(initialStroll(), step({ forward: 500 }))
    expect(pressed.position.x).toBe(ROOM.alongString)
  })

  test('and the same going the other way', () => {
    const pressed = walk(initialStroll(), step({ forward: -500 }))
    expect(pressed.position.x).toBe(-ROOM.alongString)
  })

  test('the side walls hold too', () => {
    const pressed = walk(initialStroll(), step({ sideways: 500 }))
    expect(pressed.position.z).toBe(ROOM.acrossString)
  })

  test('however long the viewer keeps pushing', () => {
    let at = initialStroll()
    for (let i = 0; i < 200; i++) at = strollTo(at, step({ forward: 1 }), ROOM)

    expect(at.position.x).toBe(ROOM.alongString)
  })

  test('walking into a wall at an angle slides along it', () => {
    // Clamped per axis rather than refused outright. Stopped dead instead, a
    // viewer pressed against a wall they cannot see the edge of has no idea
    // which way to go and the room stops feeling like a room.
    const angled = walk(
      initialStroll(),
      step({ forward: 500 }),
      step({ turned: Math.PI / 4 }),
      step({ forward: 2 }),
    )

    expect(angled.position.x, 'came away from the end wall').toBe(ROOM.alongString)
    expect(angled.position.z, 'did not slide along it').toBeGreaterThan(0.5)
  })

  test('a viewer already at the wall can still walk back in', () => {
    const returned = walk(initialStroll(), step({ forward: 500 }), step({ forward: -4 }))
    expect(returned.position.x).toBeCloseTo(ROOM.alongString - 4, 10)
  })
})
