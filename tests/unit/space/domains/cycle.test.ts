import { describe, expect, test } from 'vitest'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { cycleDomain, STEP_THRESHOLD } from '../../../../src/space/domains/cycle'

const cycle = cycleDomain(5)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('stepping a ring of things', () => {
  test('opens on the first', () => {
    expect(cycle.initial().index).toBe(0)
    expect(cycle.initial().chosen).toBe(false)
  })

  test('a turn to the right steps forward', () => {
    expect(cycle.step(cycle.initial(), asking({ yaw: STEP_THRESHOLD }), 1 / 60).index).toBe(1)
  })

  test('a turn to the left steps back, wrapping', () => {
    // Wrapping in both directions, so there is no dead end at either end.
    expect(cycle.step(cycle.initial(), asking({ yaw: -STEP_THRESHOLD }), 1 / 60).index).toBe(4)
  })

  test('a small turn does nothing yet, but is not thrown away', () => {
    const nudged = cycle.step(cycle.initial(), asking({ yaw: STEP_THRESHOLD * 0.6 }), 1 / 60)
    expect(nudged.index).toBe(0)

    const again = cycle.step(nudged, asking({ yaw: STEP_THRESHOLD * 0.6 }), 1 / 60)
    expect(again.index).toBe(1)
  })

  test('going all the way round returns to the start', () => {
    let state = cycle.initial()
    for (let step = 0; step < 5; step++) {
      state = cycle.step(state, asking({ yaw: STEP_THRESHOLD }), 1 / 60)
    }
    expect(state.index).toBe(0)
  })

  test('acting chooses whatever is in front', () => {
    expect(cycle.step(cycle.initial(), asking({ act: true }), 1 / 60).chosen).toBe(true)
  })

  test('once chosen it stops stepping', () => {
    // The shape is supposed to be the posture it was caught in, so a step
    // during the focus beat would start a morph out of the very posture being
    // frozen.
    const chosen = cycle.step(cycle.initial(), asking({ act: true }), 1 / 60)
    expect(cycle.step(chosen, asking({ yaw: STEP_THRESHOLD * 3 }), 1 / 60).index).toBe(chosen.index)
  })

  test('one thing on the ring cannot be stepped off', () => {
    const alone = cycleDomain(1)
    expect(alone.step(alone.initial(), asking({ yaw: STEP_THRESHOLD * 4 }), 1 / 60).index).toBe(0)
  })

  test('a big spin steps more than once', () => {
    expect(cycle.step(cycle.initial(), asking({ yaw: STEP_THRESHOLD * 2.5 }), 1 / 60).index).toBe(2)
  })

  test('it never modifies the state it was given', () => {
    const state = cycle.initial()
    cycle.step(state, asking({ yaw: STEP_THRESHOLD * 2, act: true }), 1 / 60)
    expect(state).toEqual({ index: 0, turned: 0, chosen: false })
  })
})

describe('what it needs to be usable', () => {
  test('it needs to browse and to enter', () => {
    expect(cycle.needs).toContain('yaw')
    expect(cycle.needs).toContain('act')
  })

  test('it does not need to advance, because nobody goes anywhere', () => {
    expect(cycle.needs).not.toContain('advance')
  })
})
