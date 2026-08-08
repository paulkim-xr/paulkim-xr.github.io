import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { requirePlace } from '../../../src/rooms/openSkiData/graph'
import { resort, type Link } from '../../../src/rooms/openSkiData/resort'
import {
  contourRings,
  curveOf,
  lineOf,
  mastOf,
  segmentsOf,
  slopeRibbon,
} from '../../../src/rooms/openSkiData/terrain'

const REGISTRY = resort()

const linkOf = (from: string, to: string): Link => {
  const found = REGISTRY.links.find((link) => link.from === from && link.to === to)
  if (!found) throw new Error(`no link ${from} -> ${to} in the fixture`)
  return found
}

/** Every corner of a geometry, as points. */
function cornersOf(geometry: { getAttribute: (name: string) => unknown }): Vector3[] {
  const position = geometry.getAttribute('position') as {
    count: number
    getX: (i: number) => number
    getY: (i: number) => number
    getZ: (i: number) => number
  }
  return Array.from(
    { length: position.count },
    (_, i) => new Vector3(position.getX(i), position.getY(i), position.getZ(i)),
  )
}

describe('the line a link is drawn along', () => {
  test('runs from one end to the other', () => {
    const link = linkOf('base', 'mid')
    const line = lineOf(REGISTRY, link)

    expect(line.length).toBeGreaterThan(8)
    expect(line[0].distanceTo(requirePlace(REGISTRY, 'base').at)).toBeCloseTo(0, 9)
    expect(line.at(-1)!.distanceTo(requirePlace(REGISTRY, 'mid').at)).toBeCloseTo(0, 9)
  })

  test('is smooth enough that a belly reads as a curve', () => {
    // Too few samples and a sagging cable draws as a couple of straight kinks.
    const line = lineOf(REGISTRY, linkOf('base', 'mid'))
    let biggestTurn = 0

    for (let step = 1; step < line.length - 1; step++) {
      const before = line[step].clone().sub(line[step - 1]).normalize()
      const after = line[step + 1].clone().sub(line[step]).normalize()
      biggestTurn = Math.max(biggestTurn, before.angleTo(after))
    }

    expect(biggestTurn).toBeLessThan(0.1)
  })

  test('a curve can be swept along it', () => {
    const curve = curveOf(REGISTRY, linkOf('base', 'mid'))
    expect(curve.getPoint(0).distanceTo(requirePlace(REGISTRY, 'base').at)).toBeCloseTo(0, 6)
    expect(curve.getPoint(1).distanceTo(requirePlace(REGISTRY, 'mid').at)).toBeCloseTo(0, 6)
  })
})

describe('a run drawn as ground', () => {
  const WIDTH = 1.4
  const ribbon = () => slopeRibbon(REGISTRY, linkOf('gully', 'base'), WIDTH)

  test('has two rails and faces to join them up', () => {
    const geometry = ribbon()
    expect(geometry.getAttribute('position').count).toBe(lineOf(REGISTRY, linkOf('gully', 'base')).length * 2)
    expect(geometry.getIndex()).not.toBeNull()
    expect(geometry.getAttribute('normal'), 'nothing to light it by').toBeDefined()
  })

  test('is as wide as it was asked to be', () => {
    // To five places, not more: the geometry is stored as 32-bit floats, so a
    // tighter tolerance than that is testing the storage rather than the maths.
    const corners = cornersOf(ribbon())

    for (let pair = 0; pair < corners.length; pair += 2) {
      expect(corners[pair].distanceTo(corners[pair + 1])).toBeCloseTo(WIDTH, 5)
    }
  })

  test('lies flat across, whatever the run is doing along', () => {
    // Widened level rather than along the true normal. Using the normal would
    // roll the ribbon onto its side wherever the run steepened, and a run on
    // its side reads as a wall rather than as ground.
    const corners = cornersOf(ribbon())

    for (let pair = 0; pair < corners.length; pair += 2) {
      expect(corners[pair].y).toBeCloseTo(corners[pair + 1].y, 6)
    }
  })

  test('its middle follows the line the link takes', () => {
    const corners = cornersOf(ribbon())
    const line = lineOf(REGISTRY, linkOf('gully', 'base'))

    for (let step = 0; step < line.length; step++) {
      const middle = corners[step * 2].clone().add(corners[step * 2 + 1]).multiplyScalar(0.5)
      expect(middle.distanceTo(line[step])).toBeCloseTo(0, 5)
    }
  })

  test('a wider run is a wider ribbon', () => {
    const narrow = cornersOf(slopeRibbon(REGISTRY, linkOf('gully', 'base'), 1))
    const wide = cornersOf(slopeRibbon(REGISTRY, linkOf('gully', 'base'), 3))

    expect(wide[0].distanceTo(wide[1])).toBeGreaterThan(narrow[0].distanceTo(narrow[1]))
  })
})

describe('the contour map', () => {
  test('is drawn at level heights', () => {
    // What a survey actually produces. Rings at arbitrary heights would be
    // decoration rather than measurement.
    const heights = new Set(cornersOf(contourRings(REGISTRY)).map((at) => at.y.toFixed(4)))
    expect(heights.size).toBeGreaterThan(3)
  })

  test('narrows with height, the way a hill does', () => {
    const byHeight = new Map<number, number>()
    for (const at of cornersOf(contourRings(REGISTRY))) {
      const radius = Math.hypot(at.x, at.z)
      byHeight.set(at.y, Math.max(byHeight.get(at.y) ?? 0, radius))
    }

    const rings = [...byHeight.entries()].sort(([one], [other]) => one - other)
    for (let ring = 1; ring < rings.length; ring++) {
      expect(rings[ring][1], `ring at ${rings[ring][0]}`).toBeLessThan(rings[ring - 1][1])
    }
  })

  test('is sized from the resort rather than from a number somebody picked', () => {
    // The contours describe the places in the registry. A mountain drawn to
    // look nice behind them would be the room inventing terrain.
    const spread = Math.max(...REGISTRY.places.map((place) => Math.hypot(place.at.x, place.at.z)))
    const widest = Math.max(...cornersOf(contourRings(REGISTRY)).map((at) => Math.hypot(at.x, at.z)))

    expect(widest).toBeGreaterThan(spread)
    expect(widest).toBeLessThan(spread * 2)
  })

  test('the lowest ring takes in the whole resort', () => {
    // Otherwise the base area sits off the edge of its own map.
    const ground = cornersOf(contourRings(REGISTRY)).filter((at) => at.y === 0)
    const widest = Math.max(...ground.map((at) => Math.hypot(at.x, at.z)))
    const furthest = Math.max(
      ...REGISTRY.places.map((place) => Math.hypot(place.at.x, place.at.z)),
    )

    expect(widest).toBeGreaterThan(furthest)
  })
})

describe('the small stuff', () => {
  test('a link as line segments is consecutive pairs of its line', () => {
    const link = linkOf('bowl', 'far')
    const line = lineOf(REGISTRY, link)
    const flat = segmentsOf(REGISTRY, link)

    expect(flat.length).toBe((line.length - 1) * 6)
    expect(flat.slice(0, 3)).toEqual([line[0].x, line[0].y, line[0].z])
    expect(flat.slice(3, 6)).toEqual([line[1].x, line[1].y, line[1].z])
  })

  test('a mast hangs straight down from its place', () => {
    const at = requirePlace(REGISTRY, 'summit').at
    const mast = mastOf(REGISTRY, 'summit', 2)

    expect(mast.slice(0, 3)).toEqual([at.x, at.y, at.z])
    expect(mast.slice(3, 6)).toEqual([at.x, at.y - 2, at.z])
  })
})
