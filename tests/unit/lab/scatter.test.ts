import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { step, type Body, type NBodyOptions } from '../../../src/lab/gravity/nbody'
import {
  centreOfMass,
  idleWatch,
  radiusOfGyration,
  scatter,
  watchClutter,
  type ScatterOptions,
} from '../../../src/lab/gravity/scatter'

const OPTIONS: ScatterOptions = {
  clumped: 0.9,
  patience: 2.5,
  strength: 4,
  swirl: 0.45,
  recentre: 0.55,
}

function momentumOf(bodies: Body[]): Vector3 {
  return bodies.reduce(
    (total, one) => total.addScaledVector(one.velocity, one.mass),
    new Vector3(),
  )
}

function body(position: [number, number, number], mass = 1): Body {
  return { position: new Vector3(...position), velocity: new Vector3(), mass, radius: 0.25 }
}

/** Nine bodies in a heap, which is the state this module exists to escape. */
function pile(): Body[] {
  return Array.from({ length: 9 }, (_, index) =>
    body([Math.cos(index) * 0.2, Math.sin(index) * 0.2, index * 0.02]),
  )
}

describe('centreOfMass', () => {
  test('is the midpoint for two equal masses', () => {
    expect(centreOfMass([body([-2, 0, 0]), body([2, 0, 0])]).toArray()).toEqual([0, 0, 0])
  })

  test('leans towards the heavier body', () => {
    expect(centreOfMass([body([-2, 0, 0], 3), body([2, 0, 0], 1)]).x).toBeLessThan(0)
  })

  test('an empty system has no centre rather than a NaN one', () => {
    expect(centreOfMass([]).toArray()).toEqual([0, 0, 0])
  })
})

describe('radiusOfGyration', () => {
  test('coincident bodies have no spread at all', () => {
    expect(radiusOfGyration([body([1, 1, 1]), body([1, 1, 1])])).toBe(0)
  })

  test('a spread system reads larger than a piled one', () => {
    const spread = [body([-3, 0, 0]), body([3, 0, 0]), body([0, 3, 0])]
    expect(radiusOfGyration(spread)).toBeGreaterThan(radiusOfGyration(pile()))
  })

  test('a pile falls below the threshold the watcher uses', () => {
    expect(radiusOfGyration(pile())).toBeLessThan(OPTIONS.clumped)
  })

  test('an empty system is zero rather than NaN', () => {
    expect(radiusOfGyration([])).toBe(0)
  })
})

describe('watchClutter', () => {
  test('a spread system never triggers, however long it runs', () => {
    const bodies = [body([-3, 0, 0]), body([3, 0, 0]), body([0, 3, 0])]
    let watch = idleWatch

    for (let frame = 0; frame < 600; frame++) {
      const result = watchClutter(watch, bodies, 1 / 60, OPTIONS)
      expect(result.burst).toBe(false)
      watch = result.watch
    }
  })

  test('a pile triggers, but only after the watcher has been patient', () => {
    const bodies = pile()
    let watch = idleWatch
    let elapsed = 0
    let firedAt: number | null = null

    for (let frame = 0; frame < 600 && firedAt === null; frame++) {
      const result = watchClutter(watch, bodies, 1 / 60, OPTIONS)
      watch = result.watch
      elapsed += 1 / 60
      if (result.burst) firedAt = elapsed
    }

    expect(firedAt).not.toBeNull()
    expect(firedAt!).toBeGreaterThanOrEqual(OPTIONS.patience)
    expect(firedAt!).toBeLessThan(OPTIONS.patience + 0.1)
  })

  test('a system that spreads again resets the countdown', () => {
    const bodies = pile()
    let watch = watchClutter(idleWatch, bodies, 2.4, OPTIONS).watch
    expect(watch.held).toBeCloseTo(2.4)

    const spread = [body([-3, 0, 0]), body([3, 0, 0]), body([0, 3, 0])]
    watch = watchClutter(watch, spread, 1 / 60, OPTIONS).watch

    expect(watch.held).toBe(0)
  })

  test('counts each burst, so no two are thrown the same way', () => {
    const bodies = pile()
    const first = watchClutter(idleWatch, bodies, OPTIONS.patience, OPTIONS)
    const second = watchClutter(first.watch, bodies, OPTIONS.patience, OPTIONS)

    expect(first.watch.bursts).toBe(1)
    expect(second.watch.bursts).toBe(2)
  })
})

describe('scatter', () => {
  test('breaks the pile apart', () => {
    const bodies = pile()
    const nbody: NBodyOptions = { strength: 5.5, bounds: 3.4, restitution: 0.86, softening: 0.45 }
    const before = radiusOfGyration(bodies)

    scatter(bodies, OPTIONS, 0)
    for (let frame = 0; frame < 60; frame++) step(bodies, 1 / 60, nbody)

    expect(radiusOfGyration(bodies)).toBeGreaterThan(before)
  })

  test('every body gains speed', () => {
    const bodies = pile()
    scatter(bodies, OPTIONS, 0)
    for (const one of bodies) expect(one.velocity.length()).toBeGreaterThan(0)
  })

  test('successive bursts throw the cloud differently', () => {
    const first = pile()
    const second = pile()

    scatter(first, OPTIONS, 0)
    scatter(second, OPTIONS, 1)

    // Same starting pile, different burst index: if these matched, the
    // simulation would settle into a loop of identical explosions.
    expect(first[0].velocity.distanceTo(second[0].velocity)).toBeGreaterThan(0.1)
  })

  test('the same burst index is reproducible', () => {
    const first = pile()
    const second = pile()

    scatter(first, OPTIONS, 3)
    scatter(second, OPTIONS, 3)

    expect(first[0].velocity.toArray()).toEqual(second[0].velocity.toArray())
  })

  test('with no recentring, the burst leaves the cloud going nowhere as a whole', () => {
    const bodies = pile()
    for (const one of bodies) one.velocity.set(2, -3, 1) // all sailing one way

    scatter(bodies, { ...OPTIONS, recentre: 0 }, 0)

    // The drift that carried the system into a wall is gone; what is left is
    // the explosion, which is symmetric about the centre of mass.
    expect(momentumOf(bodies).length()).toBeLessThan(1e-6)
  })

  test('recentring aims the cloud home instead, drift and all', () => {
    // Piled in a corner and still heading further into it.
    const bodies = pile().map((one) => {
      one.position.add(new Vector3(2.4, -2.4, 2.4))
      one.velocity.set(2, -3, 2)
      return one
    })

    scatter(bodies, OPTIONS, 0)

    const home = new Vector3(-2.4, 2.4, -2.4).normalize()
    expect(momentumOf(bodies).dot(home)).toBeGreaterThan(0)
  })

  test('a pile parked in a corner is thrown back towards the middle', () => {
    const corner = pile().map((one) => {
      one.position.add(new Vector3(2.4, -2.4, 2.4))
      return one
    })

    scatter(corner, OPTIONS, 0)

    // Every body should now be heading away from the corner it was stuck in.
    const towardsHome = corner.filter((one) => one.velocity.dot(new Vector3(-1, 1, -1)) > 0)
    expect(towardsHome.length).toBeGreaterThan(corner.length / 2)
  })

  test('bodies exactly at the centre are still thrown somewhere', () => {
    const bodies = [body([0, 0, 0]), body([0, 0, 0])]
    scatter(bodies, OPTIONS, 0)

    for (const one of bodies) {
      expect(Number.isFinite(one.velocity.length())).toBe(true)
      expect(one.velocity.length()).toBeGreaterThan(0)
    }
  })
})
