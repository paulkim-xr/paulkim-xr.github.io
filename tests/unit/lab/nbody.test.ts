import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { MAX_STEP, step, type Body, type NBodyOptions } from '../../../src/lab/gravity/nbody'

const OPTIONS: NBodyOptions = { strength: 12, bounds: 4, restitution: 0.9, softening: 0.35 }

function body(position: [number, number, number], velocity: [number, number, number] = [0, 0, 0]): Body {
  return {
    position: new Vector3(...position),
    velocity: new Vector3(...velocity),
    mass: 1,
    radius: 0.3,
  }
}

function momentumOf(bodies: Body[]): Vector3 {
  return bodies.reduce(
    (total, one) => total.addScaledVector(one.velocity, one.mass),
    new Vector3(),
  )
}

describe('attraction', () => {
  test('two bodies at rest fall towards each other', () => {
    const bodies = [body([-1, 0, 0]), body([1, 0, 0])]
    const before = bodies[0].position.distanceTo(bodies[1].position)

    for (let frame = 0; frame < 10; frame++) step(bodies, 1 / 60, OPTIONS)

    expect(bodies[0].position.distanceTo(bodies[1].position)).toBeLessThan(before)
  })

  test('a lone body does not move', () => {
    const bodies = [body([1, 2, -1])]
    for (let frame = 0; frame < 30; frame++) step(bodies, 1 / 60, OPTIONS)
    expect(bodies[0].position.toArray()).toEqual([1, 2, -1])
  })

  test('momentum is conserved while nothing touches a wall', () => {
    // Far from the walls and moving slowly, so only gravity acts.
    const bodies = [body([-1, 0, 0], [0, 0.1, 0]), body([1, 0, 0], [0, -0.1, 0])]
    const before = momentumOf(bodies).clone()

    for (let frame = 0; frame < 60; frame++) step(bodies, 1 / 120, OPTIONS)

    const after = momentumOf(bodies)
    expect(after.distanceTo(before)).toBeLessThan(1e-9)
  })

  test('softening keeps a near-miss finite', () => {
    // Two bodies almost coincident is the case that sends an unsoftened
    // inverse square to infinity and the body to the other side of the world.
    const bodies = [body([0, 0, 0]), body([1e-6, 0, 0])]

    step(bodies, 1 / 60, OPTIONS)

    for (const one of bodies) {
      expect(Number.isFinite(one.velocity.length())).toBe(true)
      expect(one.velocity.length()).toBeLessThan(10)
    }
  })

  test('coincident bodies are skipped rather than dividing by zero', () => {
    const bodies = [body([0, 0, 0]), body([0, 0, 0])]
    step(bodies, 1 / 60, OPTIONS)
    for (const one of bodies) expect(Number.isNaN(one.position.length())).toBe(false)
  })
})

describe('confinement', () => {
  test('a body fired at a wall stays in the box', () => {
    const bodies = [body([0, 0, 0], [50, 30, -40])]

    for (let frame = 0; frame < 400; frame++) step(bodies, 1 / 60, OPTIONS)

    const { x, y, z } = bodies[0].position
    for (const axis of [x, y, z]) {
      expect(Math.abs(axis)).toBeLessThanOrEqual(OPTIONS.bounds)
    }
  })

  test('a bounce reverses the axis it hit and leaves the others alone', () => {
    const bodies = [body([OPTIONS.bounds - 0.31, 0, 0], [5, 2, 0])]

    step(bodies, 1 / 60, OPTIONS)

    expect(bodies[0].velocity.x).toBeLessThan(0)
    expect(bodies[0].velocity.y).toBeCloseTo(2, 5)
  })

  test('restitution takes energy out rather than adding it', () => {
    const bodies = [body([OPTIONS.bounds - 0.31, 0, 0], [5, 0, 0])]
    step(bodies, 1 / 60, OPTIONS)
    expect(Math.abs(bodies[0].velocity.x)).toBeLessThan(5)
  })
})

describe('contacts', () => {
  test('overlapping bodies are pushed apart', () => {
    const bodies = [body([0, 0, 0]), body([0.2, 0, 0])]

    step(bodies, 1 / 60, OPTIONS)

    expect(bodies[0].position.distanceTo(bodies[1].position)).toBeCloseTo(
      bodies[0].radius + bodies[1].radius,
      2,
    )
  })

  test('bodies already separating are not pulled back together', () => {
    // Without the approach check, an impulse is applied on every frame they
    // remain in contact and the pair sticks.
    const bodies = [body([0, 0, 0], [-1, 0, 0]), body([0.5, 0, 0], [1, 0, 0])]

    step(bodies, 1 / 60, OPTIONS)

    expect(bodies[0].velocity.x).toBeLessThan(0)
    expect(bodies[1].velocity.x).toBeGreaterThan(0)
  })
})

describe('step size', () => {
  test('a huge delta is clamped rather than detonating the simulation', () => {
    const bodies = [body([-1, 0, 0]), body([1, 0, 0])]

    // What a backgrounded tab hands back on return.
    step(bodies, 30, OPTIONS)

    for (const one of bodies) {
      expect(one.velocity.length()).toBeLessThan(30 * OPTIONS.strength)
      expect(Math.abs(one.position.x)).toBeLessThanOrEqual(OPTIONS.bounds)
    }
  })

  test('a clamped step matches the longest legal one exactly', () => {
    const huge = [body([-1, 0, 0]), body([1, 0, 0])]
    const clamped = [body([-1, 0, 0]), body([1, 0, 0])]

    step(huge, 5, OPTIONS)
    step(clamped, MAX_STEP, OPTIONS)

    expect(huge[0].position.x).toBeCloseTo(clamped[0].position.x, 12)
  })

  test('a zero or negative delta changes nothing', () => {
    const bodies = [body([-1, 0, 0]), body([1, 0, 0])]
    step(bodies, 0, OPTIONS)
    step(bodies, -1, OPTIONS)
    expect(bodies[0].position.x).toBe(-1)
    expect(bodies[0].velocity.length()).toBe(0)
  })
})
