import { describe, expect, test } from 'vitest'
import { linksFrom, requirePlace } from '../../../src/rooms/openSkiData/graph'
import { resort } from '../../../src/rooms/openSkiData/resort'
import {
  advance,
  depart,
  focusOf,
  lengthOf,
  look,
  pointedAt,
  positionOf,
  SPEED,
  startAt,
  type Journey,
} from '../../../src/rooms/openSkiData/travel'

const REGISTRY = resort()

/** Points the journey at the link with this name, or fails. */
function pointAt(journey: Journey, name: string): Journey {
  if (journey.at !== 'place') throw new Error('not standing anywhere')
  const count = linksFrom(REGISTRY, journey.place).length

  for (let step = 0; step < count; step++) {
    const tried = look(REGISTRY, journey, step)
    if (pointedAt(REGISTRY, tried)?.name === name) return tried
  }
  throw new Error(`no link named ${name} leaves ${journey.place}`)
}

/** Rides whatever is chosen all the way to the far end. */
function ride(journey: Journey): Journey {
  let going = depart(REGISTRY, journey)
  for (let frame = 0; frame < 10_000 && going.at === 'link'; frame++) {
    going = advance(REGISTRY, going, 1 / 60)
  }
  return going
}

describe('standing at a place', () => {
  test('starts pointed at something', () => {
    expect(pointedAt(REGISTRY, startAt('base'))).toBeDefined()
  })

  test('looking round steps through the choices', () => {
    const first = pointedAt(REGISTRY, startAt('base'))
    const second = pointedAt(REGISTRY, look(REGISTRY, startAt('base'), 1))

    expect(second).toBeDefined()
    expect(second).not.toBe(first)
  })

  test('looking round wraps rather than sticking at the end', () => {
    // A viewer holding a key down should cycle, not jam against a stop they
    // cannot see.
    const here = startAt('base')
    const count = linksFrom(REGISTRY, 'base').length

    expect(pointedAt(REGISTRY, look(REGISTRY, here, count))).toBe(pointedAt(REGISTRY, here))
    expect(pointedAt(REGISTRY, look(REGISTRY, here, -count))).toBe(pointedAt(REGISTRY, here))
  })

  test('looking round backwards works too', () => {
    const here = startAt('base')
    const back = look(REGISTRY, here, -1)
    expect(pointedAt(REGISTRY, back)).toBeDefined()
    expect(pointedAt(REGISTRY, look(REGISTRY, back, 1))).toBe(pointedAt(REGISTRY, here))
  })

  test('a place with nowhere to go points at nothing and does not crash', () => {
    const stuck = startAt('webcam')
    expect(pointedAt(REGISTRY, stuck)).toBeUndefined()
    expect(look(REGISTRY, stuck, 1)).toEqual(stuck)
    expect(depart(REGISTRY, stuck)).toEqual(stuck)
  })

  test('the viewer stands exactly at the place', () => {
    expect(positionOf(REGISTRY, startAt('mid')).distanceTo(requirePlace(REGISTRY, 'mid').at))
      .toBeCloseTo(0, 10)
  })

  test('and looks along whatever they are considering', () => {
    // The choice is shown by the view rather than by a cursor on a list.
    const here = startAt('base')
    const chosen = pointedAt(REGISTRY, here)
    expect(chosen).toBeDefined()

    expect(focusOf(REGISTRY, here).distanceTo(requirePlace(REGISTRY, chosen!.to).at))
      .toBeCloseTo(0, 10)
  })
})

describe('setting off', () => {
  test('a travellable link starts a journey along it', () => {
    const going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))

    expect(going.at).toBe('link')
    if (going.at === 'link') {
      expect(going.link.name).toBe('Base Gondola')
      expect(going.progress).toBe(0)
    }
  })

  test('an unsurveyed link refuses', () => {
    // The room's whole argument. The data does not exist, so neither does the
    // way through, and wanting to go does not change it.
    const facingTheGap = pointAt(startAt('bowl'), 'not yet surveyed')
    expect(depart(REGISTRY, facingTheGap)).toEqual(facingTheGap)
  })

  test('the viewer cannot get off partway', () => {
    // You do not step off a chairlift in the middle. Allowing it would make the
    // graph decorative rather than the thing being travelled.
    let going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))
    going = advance(REGISTRY, going, 0.2)

    expect(look(REGISTRY, going, 1)).toEqual(going)
    expect(depart(REGISTRY, going)).toEqual(going)
  })
})

describe('travelling', () => {
  test('arrives at the far end and stands there', () => {
    const arrived = ride(pointAt(startAt('base'), 'Base Gondola'))

    expect(arrived.at).toBe('place')
    if (arrived.at === 'place') expect(arrived.place).toBe('mid')
  })

  test('arrives already pointed at something, so hops chain', () => {
    const arrived = ride(pointAt(startAt('base'), 'Base Gondola'))
    expect(pointedAt(REGISTRY, arrived)).toBeDefined()
  })

  test('takes about as long as the link is long', () => {
    const link = linksFrom(REGISTRY, 'base').find((one) => one.name === 'Base Gondola')!
    const expected = lengthOf(REGISTRY, link) / SPEED

    let going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))
    let seconds = 0
    while (going.at === 'link' && seconds < 100) {
      going = advance(REGISTRY, going, 1 / 60)
      seconds += 1 / 60
    }

    expect(seconds).toBeCloseTo(expected, 1)
  })

  test('a longer link takes longer', () => {
    const ridden = (name: string, from: string) => {
      let going = depart(REGISTRY, pointAt(startAt(from), name))
      let seconds = 0
      while (going.at === 'link' && seconds < 100) {
        going = advance(REGISTRY, going, 1 / 60)
        seconds += 1 / 60
      }
      return seconds
    }

    const link = (name: string, from: string) =>
      lengthOf(REGISTRY, linksFrom(REGISTRY, from).find((one) => one.name === name)!)

    const shortOne = link('Service Track', 'mid')
    const longOne = link('Summit Chair', 'mid')
    expect(longOne).toBeGreaterThan(shortOne)
    expect(ridden('Summit Chair', 'mid')).toBeGreaterThan(ridden('Service Track', 'mid'))
  })

  test('moves steadily forward and never backwards', () => {
    let going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))
    const start = positionOf(REGISTRY, going)
    let travelled = 0

    while (going.at === 'link') {
      const next = advance(REGISTRY, going, 1 / 60)
      if (next.at !== 'link') break
      const gone = positionOf(REGISTRY, next).distanceTo(start)
      expect(gone).toBeGreaterThanOrEqual(travelled - 1e-9)
      travelled = gone
      going = next
    }

    expect(travelled).toBeGreaterThan(0)
  })

  test('looks ahead of itself rather than at its own feet', () => {
    // What makes a ride read as travel instead of as being dragged through a
    // scene backwards.
    let going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))
    going = advance(REGISTRY, going, 0.3)

    const feet = positionOf(REGISTRY, going)
    const eyes = focusOf(REGISTRY, going)
    const destination = requirePlace(REGISTRY, 'mid').at

    expect(eyes.distanceTo(feet)).toBeGreaterThan(0.2)
    expect(eyes.distanceTo(destination)).toBeLessThan(feet.distanceTo(destination))
  })

  test('the view never degenerates, right to the end of the ride', () => {
    // Looking a fixed distance ahead runs off the end of the link near the
    // finish, where aiming at a point no distance away leaves the camera with
    // nothing to orient by.
    let going = depart(REGISTRY, pointAt(startAt('base'), 'Base Gondola'))

    while (going.at === 'link') {
      expect(focusOf(REGISTRY, going).distanceTo(positionOf(REGISTRY, going))).toBeGreaterThan(0.05)
      going = advance(REGISTRY, going, 1 / 60)
    }
  })

  test('standing still, advancing changes nothing', () => {
    const here = startAt('base')
    expect(advance(REGISTRY, here, 5)).toEqual(here)
  })
})
