import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import {
  CHOICE_THRESHOLD,
  DEPART_THRESHOLD,
  mountainDomain,
  type MountainState,
} from '../../../../src/space/domains/mountain'
import { resort } from '../../../../src/rooms/openSkiData/resort'
import { pointedAt } from '../../../../src/rooms/openSkiData/travel'

const REGISTRY = resort()
const ARRIVAL = 'base'
const mountain = mountainDomain(REGISTRY, ARRIVAL, 1.7, -0.24)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

/** Feeds one intent for a run of frames. */
function hold(state: MountainState, intents: Intents, frames: number): MountainState {
  let carried = state
  for (let frame = 0; frame < frames; frame++) carried = mountain.step(carried, intents, 1 / 60)
  return carried
}

describe('standing at a place', () => {
  test('opens at the arrival, pointed at something', () => {
    const state = mountain.initial()
    expect(state.journey).toEqual({ at: 'place', place: ARRIVAL, choice: 0 })
    expect(pointedAt(REGISTRY, state.journey)).toBeDefined()
  })

  test('a small turn does not change the choice', () => {
    // Otherwise the choice flickers through every link as you look around.
    const nudged = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD / 4 }), 1 / 60)
    expect(nudged.journey).toEqual(mountain.initial().journey)
  })

  test('turning far enough steps to the next link', () => {
    const stepped = mountain.step(
      mountain.initial(),
      asking({ yaw: CHOICE_THRESHOLD * 1.1 }),
      1 / 60,
    )

    expect(stepped.journey).not.toEqual(mountain.initial().journey)
    expect(pointedAt(REGISTRY, stepped.journey)).not.toEqual(
      pointedAt(REGISTRY, mountain.initial().journey),
    )
  })

  test('a slow turn accumulates instead of being thrown away', () => {
    // A drag delivers a few hundredths of a radian per frame. Discarding each
    // one would make the mountain unusable with a finger.
    const crept = hold(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD / 8 }), 10)

    expect(pointedAt(REGISTRY, crept.journey)).not.toEqual(
      pointedAt(REGISTRY, mountain.initial().journey),
    )
  })

  test('turning back and forth ends up where it started', () => {
    const there = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD * 1.1 }), 1 / 60)
    const back = mountain.step(there, asking({ yaw: -CHOICE_THRESHOLD * 1.1 }), 1 / 60)

    expect(back.journey).toEqual(mountain.initial().journey)
  })
})

describe('departing', () => {
  test('a firm advance sets off along the chosen link', () => {
    const gone = mountain.step(
      mountain.initial(),
      asking({ advance: DEPART_THRESHOLD + 0.1 }),
      1 / 60,
    )
    expect(gone.journey.at).toBe('link')
  })

  test('a feather-light advance does not', () => {
    const stayed = mountain.step(
      mountain.initial(),
      asking({ advance: DEPART_THRESHOLD / 2 }),
      1 / 60,
    )
    expect(stayed.journey.at).toBe('place')
  })

  test('the ride cannot be got off halfway', () => {
    // You cannot get off a chairlift in the middle, and pretending otherwise
    // would make the graph decorative rather than the thing being travelled.
    let state = mountain.step(mountain.initial(), asking({ advance: 1 }), 1 / 60)
    const link = state.journey.at === 'link' ? state.journey.link : undefined
    state = hold(state, asking({ yaw: CHOICE_THRESHOLD * 4 }), 3)

    expect(state.journey.at).toBe('link')
    expect(state.journey.at === 'link' ? state.journey.link : undefined).toEqual(link)
  })

  test('riding long enough arrives somewhere else', () => {
    let state = mountain.step(mountain.initial(), asking({ advance: 1 }), 1 / 60)
    state = hold(state, NO_INTENTS, 60 * 30)

    expect(state.journey.at).toBe('place')
    expect(state.journey.at === 'place' ? state.journey.place : '').not.toBe(ARRIVAL)
  })

  test('an unsurveyed link refuses to be departed', () => {
    // The room's whole argument: the data does not exist, so neither does the
    // way through. Started at the bowl, whose one outgoing link is the
    // unsurveyed couloir — `linksFrom` is directional, so nothing unsurveyed
    // leaves the base.
    const bowl = mountainDomain(REGISTRY, 'bowl', 1.7, -0.24)
    const state = bowl.initial()

    expect(pointedAt(REGISTRY, state.journey)?.kind, 'the fixture changed').toBe('unsurveyed')
    expect(bowl.step(state, asking({ advance: 1 }), 1 / 60).journey.at).toBe('place')
  })
})

describe('the pose it hands the rig', () => {
  test('puts the eyes above the place being stood at', () => {
    expect(mountain.poseOf(mountain.initial()).position.y).toBeGreaterThan(0)
  })

  test('settles rather than snapping when the choice changes', () => {
    // The eased aim used to live in the component and could not be tested.
    const stepped = mountain.step(
      mountain.initial(),
      asking({ yaw: CHOICE_THRESHOLD * 1.1 }),
      1 / 60,
    )
    const settled = hold(stepped, NO_INTENTS, 120)

    expect(stepped.aim.distanceTo(settled.aim)).toBeGreaterThan(0.01)
  })

  test('a small turn looks about without changing the choice', () => {
    // Turning and choosing are the same gesture: the view is aimed along the
    // graph's heading turned by whatever has been banked, so a drag too small
    // to step still moves the picture. Without this the room would have no
    // free look at all, and you could not see the mountain from beside it.
    const nudged = mountain.step(mountain.initial(), asking({ yaw: CHOICE_THRESHOLD / 2 }), 1 / 60)

    expect(nudged.journey).toEqual(mountain.initial().journey)
    expect(
      new Vector3(0, 0, -1).applyQuaternion(mountain.poseOf(nudged).orientation).angleTo(
        new Vector3(0, 0, -1).applyQuaternion(mountain.poseOf(mountain.initial()).orientation),
      ),
    ).toBeGreaterThan(0.05)
  })

  test('a turn taken while riding only looks, and cannot bank up', () => {
    // A long ride spent dragging would otherwise spend itself stepping through
    // the choices the moment the viewer arrived.
    let state = mountain.step(mountain.initial(), asking({ advance: 1 }), 1 / 60)
    state = hold(state, asking({ yaw: CHOICE_THRESHOLD }), 20)

    expect(Math.abs(state.turned)).toBeLessThanOrEqual(CHOICE_THRESHOLD)
  })

  test('it never modifies the state it was given', () => {
    const state = mountain.initial()
    const before = state.aim.clone()
    mountain.step(state, asking({ advance: 1, yaw: 1 }), 1 / 60)

    expect(state.aim.distanceTo(before)).toBe(0)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to choose and to go', () => {
    expect(mountain.needs).toContain('advance')
    expect(mountain.needs).toContain('yaw')
  })
})
