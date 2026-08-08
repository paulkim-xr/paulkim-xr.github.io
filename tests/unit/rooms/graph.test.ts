import { describe, expect, test } from 'vitest'
import {
  bearingTo,
  bellyOf,
  isTravellable,
  linksFrom,
  placeOf,
  pointAlong,
  requirePlace,
  riseOf,
  unreachable,
} from '../../../src/rooms/openSkiData/graph'
import { ARRIVAL_PLACE, resort, type Link } from '../../../src/rooms/openSkiData/resort'

const REGISTRY = resort()

const linkOf = (from: string, to: string): Link => {
  const found = REGISTRY.links.find((link) => link.from === from && link.to === to)
  if (!found) throw new Error(`no link ${from} -> ${to} in the fixture`)
  return found
}

describe('the registry itself', () => {
  test('every link joins two places that exist', () => {
    // A link to nowhere would draw a cable off into the void and put the
    // traveller somewhere with no way back.
    for (const link of REGISTRY.links) {
      expect(placeOf(REGISTRY, link.from), `${link.name} starts nowhere`).toBeDefined()
      expect(placeOf(REGISTRY, link.to), `${link.name} goes nowhere`).toBeDefined()
    }
  })

  test('place ids are unique', () => {
    const ids = REGISTRY.places.map((place) => place.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('lifts go up and slopes come down', () => {
    // Not interchangeable. A graph that forgot which was which would happily
    // let you ski uphill.
    for (const link of REGISTRY.links) {
      if (link.kind === 'lift') expect(riseOf(REGISTRY, link), link.name).toBeGreaterThan(0)
      if (link.kind === 'slope') expect(riseOf(REGISTRY, link), link.name).toBeLessThan(0)
    }
  })

  test('the arrival place is in the registry', () => {
    expect(placeOf(REGISTRY, ARRIVAL_PLACE)).toBeDefined()
  })

  test('there is something to do from the arrival place', () => {
    expect(linksFrom(REGISTRY, ARRIVAL_PLACE).length).toBeGreaterThan(0)
  })

  test('asking for a place that is not there is an error, not a silence', () => {
    expect(() => requirePlace(REGISTRY, 'nowhere')).toThrow(/nowhere/)
  })
})

describe('what the registry is missing', () => {
  test('it has gaps at all', () => {
    // The room's whole argument. A complete registry would have nothing to say
    // about being open.
    expect(REGISTRY.links.some((link) => link.kind === 'unsurveyed')).toBe(true)
  })

  test('unsurveyed links cannot be travelled and everything else can', () => {
    for (const link of REGISTRY.links) {
      expect(isTravellable(link)).toBe(link.kind !== 'unsurveyed')
    }
  })

  test('some place really is cut off by the gaps', () => {
    // If every unsurveyed link ran alongside a surveyed one, the gaps would be
    // decorative — you could always get there anyway, and nothing would be at
    // stake in the data being incomplete.
    const stranded = unreachable(REGISTRY, ARRIVAL_PLACE)

    expect(stranded.length).toBeGreaterThan(0)
    expect(stranded.every((place) => place.id !== ARRIVAL_PLACE)).toBe(true)
  })

  test('everything else is reachable from the base', () => {
    // The gaps should be deliberate, not the accidental result of a link typed
    // the wrong way round.
    const stranded = unreachable(REGISTRY, ARRIVAL_PLACE).map((place) => place.id)
    expect(stranded).toEqual(['far'])
  })

  test('a registry with no gaps strands nobody', () => {
    const complete = {
      places: REGISTRY.places.filter((place) => place.id !== 'far'),
      links: REGISTRY.links.filter((link) => link.kind !== 'unsurveyed'),
    }
    expect(unreachable(complete, ARRIVAL_PLACE)).toEqual([])
  })
})

describe('the choices at a place', () => {
  test('are the links leaving it', () => {
    const names = linksFrom(REGISTRY, 'base').map((link) => link.name)
    expect(names).toContain('Base Gondola')
    expect(names).toContain('Gully Chair')
  })

  test('do not include links arriving at it', () => {
    // You cannot ride a slope backwards up the hill.
    expect(linksFrom(REGISTRY, 'base').map((link) => link.name)).not.toContain('Home Run')
  })

  test('include the ways that are not surveyed', () => {
    // Left out, the room would silently hide exactly what it is about — a
    // viewer would never learn there was supposed to be a way down there.
    expect(linksFrom(REGISTRY, 'bowl').some((link) => link.kind === 'unsurveyed')).toBe(true)
  })

  test('run round the horizon rather than in the order they were typed', () => {
    // So that stepping left and right follows what the viewer can see in front
    // of them instead of the order somebody happened to write the file in.
    const here = requirePlace(REGISTRY, 'base')
    const bearings = linksFrom(REGISTRY, 'base').map((link) =>
      bearingTo(here, requirePlace(REGISTRY, link.to)),
    )

    expect(bearings).toEqual([...bearings].sort((one, other) => one - other))
  })

  test('a place with nothing leaving it offers nothing', () => {
    expect(linksFrom(REGISTRY, 'webcam')).toEqual([])
  })
})

describe('the line a link takes', () => {
  test('starts and ends exactly at the places it joins', () => {
    // However a cable bellies in the middle, it has to arrive at its own
    // pylons. A curve that missed would leave every lift hanging off the side
    // of the thing it is strung from.
    for (const link of REGISTRY.links) {
      const from = requirePlace(REGISTRY, link.from).at
      const to = requirePlace(REGISTRY, link.to).at

      expect(pointAlong(REGISTRY, link, 0).distanceTo(from)).toBeCloseTo(0, 10)
      expect(pointAlong(REGISTRY, link, 1).distanceTo(to)).toBeCloseTo(0, 10)
    }
  })

  test('a lift sags below the straight line between its ends', () => {
    const link = linkOf('base', 'mid')
    const from = requirePlace(REGISTRY, link.from).at
    const to = requirePlace(REGISTRY, link.to).at

    const middle = pointAlong(REGISTRY, link, 0.5)
    expect(middle.y).toBeLessThan(from.clone().lerp(to, 0.5).y)
  })

  test('a slope bulges above it, because a mountainside is not a ramp', () => {
    const link = linkOf('gully', 'base')
    const from = requirePlace(REGISTRY, link.from).at
    const to = requirePlace(REGISTRY, link.to).at

    const middle = pointAlong(REGISTRY, link, 0.5)
    expect(middle.y).toBeGreaterThan(from.clone().lerp(to, 0.5).y)
  })

  test('an unsurveyed line is drawn straight, claiming nothing about the ground', () => {
    expect(bellyOf(linkOf('bowl', 'far'), 20)).toBe(0)
  })

  test('a longer link bellies further', () => {
    expect(Math.abs(bellyOf(linkOf('base', 'mid'), 40))).toBeGreaterThan(
      Math.abs(bellyOf(linkOf('base', 'mid'), 10)),
    )
  })

  test('the line runs monotonically from one end to the other', () => {
    // Horizontally, at least: a link that doubled back on itself would read as
    // a knot rather than as a way of getting somewhere.
    const link = linkOf('base', 'mid')
    let last = pointAlong(REGISTRY, link, 0)

    for (let step = 1; step <= 20; step++) {
      const next = pointAlong(REGISTRY, link, step / 20)
      expect(next.distanceTo(requirePlace(REGISTRY, link.from).at)).toBeGreaterThan(
        last.distanceTo(requirePlace(REGISTRY, link.from).at) - 1e-9,
      )
      last = next
    }
  })
})
