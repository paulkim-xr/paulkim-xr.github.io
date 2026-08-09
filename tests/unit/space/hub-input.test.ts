import { describe, expect, test } from 'vitest'
import { DWELL_MS, idleGesture, SLOP_PX } from '../../../src/space/gesture'
import type { Signals } from '../../../src/space/technique'
import { LOOK_PER_PIXEL, stillPointerTechnique } from '../../../src/space/techniques/pointer'
import { stepKeysTechnique } from '../../../src/space/techniques/stepKeys'
import { WHEEL_PER_STEP, wheelTechnique } from '../../../src/space/techniques/wheel'
import { cycleDomain, STEP_THRESHOLD } from '../../../src/space/domains/cycle'
import { NO_INTENTS } from '../../../src/space/intents'

const signals = (part: Partial<Signals> = {}): Signals => ({
  keys: new Set<string>(),
  struck: new Set<string>(),
  presses: [],
  wheel: 0,
  now: 0,
  ...part,
})

const FRAME = 1 / 60

describe('the pointer in a space with nowhere to walk', () => {
  test('a press held past the dwell never becomes a walk', () => {
    const { intents } = stillPointerTechnique.reduce(
      idleGesture(),
      signals({
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'tick', at: DWELL_MS * 10 },
        ],
      }),
      FRAME,
    )

    expect(intents.advance).toBe(0)
  })

  test('and so a slow click still acts', () => {
    // The whole reason this variant exists. The walking pointer swallows the
    // tap on release once a press has become a walk, so on the hub a click
    // held a moment too long would simply not open the project.
    const { intents } = stillPointerTechnique.reduce(
      idleGesture(),
      signals({
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'tick', at: DWELL_MS * 3 },
          { kind: 'up', at: DWELL_MS * 4 },
        ],
      }),
      FRAME,
    )

    expect(intents.act).toBe(true)
  })

  test('it says it cannot advance, so the coverage check knows', () => {
    expect(stillPointerTechnique.produces).not.toContain('advance')
    expect(stillPointerTechnique.produces).toContain('yaw')
    expect(stillPointerTechnique.produces).toContain('act')
  })

  test('a drag still turns, at the same rate as anywhere else', () => {
    const { intents } = stillPointerTechnique.reduce(
      idleGesture(),
      signals({
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'move', x: SLOP_PX + 100, y: 0, at: 20 },
        ],
      }),
      FRAME,
    )

    expect(intents.yaw).toBeCloseTo(-(SLOP_PX + 100) * LOOK_PER_PIXEL, 9)
  })
})

describe('the wheel', () => {
  test('a notch is about one step of the ring', () => {
    const { intents } = wheelTechnique.reduce(null, signals({ wheel: WHEEL_PER_STEP }), FRAME)
    expect(intents.yaw).toBeCloseTo(STEP_THRESHOLD, 9)
  })

  test('scrolling the other way turns the other way', () => {
    const { intents } = wheelTechnique.reduce(null, signals({ wheel: -WHEEL_PER_STEP }), FRAME)
    expect(intents.yaw).toBeCloseTo(-STEP_THRESHOLD, 9)
  })

  test('no wheel travel asks for nothing', () => {
    expect(wheelTechnique.reduce(null, signals(), FRAME).intents).toEqual(NO_INTENTS)
  })
})

describe('the keyboard, for a ring rather than a space', () => {
  const striking = (...names: string[]): Partial<Signals> => ({
    keys: new Set(names),
    struck: new Set(names),
  })

  test('one press steps the ring by exactly one', () => {
    // On a list an arrow key means "next". A room's keys emit a rate and you
    // hold them; tapping one of those turns you about a degree, which on a
    // carousel is no movement at all.
    const ring = cycleDomain(5)
    const { intents } = stepKeysTechnique.reduce(null, signals(striking('arrowright')), FRAME)

    expect(ring.step(ring.initial(), intents, FRAME).index).toBe(1)
  })

  test('the other arrow steps back, wrapping', () => {
    const ring = cycleDomain(5)
    const { intents } = stepKeysTechnique.reduce(null, signals(striking('arrowleft')), FRAME)

    expect(ring.step(ring.initial(), intents, FRAME).index).toBe(4)
  })

  test('holding one keeps going, slowly enough to read', () => {
    const ring = cycleDomain(5)
    let state = ring.initial()
    const held = signals({ keys: new Set(['arrowright']), struck: new Set() })

    // A second of holding, a frame at a time.
    for (let frame = 0; frame < 60; frame++) {
      state = ring.step(state, stepKeysTechnique.reduce(null, held, FRAME).intents, FRAME)
    }

    expect(state.index, 'a held arrow should keep stepping').toBeGreaterThan(0)
  })

  test('enter picks whatever is in front', () => {
    const ring = cycleDomain(5)
    const { intents } = stepKeysTechnique.reduce(null, signals(striking('enter')), FRAME)

    expect(ring.step(ring.initial(), intents, FRAME).chosen).toBe(true)
  })

  test('a held enter picks once, not once a frame', () => {
    const first = stepKeysTechnique.reduce(null, signals(striking('enter')), FRAME)
    const still = stepKeysTechnique.reduce(
      null,
      signals({ keys: new Set(['enter']), struck: new Set() }),
      FRAME,
    )

    expect(first.intents.act).toBe(true)
    expect(still.intents.act).toBe(false)
  })

  test('nothing held asks for nothing', () => {
    expect(stepKeysTechnique.reduce(null, signals(), FRAME).intents).toEqual(NO_INTENTS)
  })
})

describe('a notch of the wheel, end to end', () => {
  test('steps the ring exactly once', () => {
    // The three pieces have to agree on what a step is, or scrolling would
    // move the carousel by some fraction of a project.
    const ring = cycleDomain(5)
    const { intents } = wheelTechnique.reduce(null, signals({ wheel: WHEEL_PER_STEP }), FRAME)

    expect(ring.step(ring.initial(), intents, FRAME).index).toBe(1)
  })

  test('and a drag of the shipped step distance does the same', () => {
    // 110 pixels was the carousel's own step before any of this existed.
    const ring = cycleDomain(5)
    const { intents } = stillPointerTechnique.reduce(
      idleGesture(),
      signals({
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'move', x: -110, y: 0, at: 20 },
        ],
      }),
      FRAME,
    )

    expect(ring.step(ring.initial(), intents, FRAME).index).toBe(1)
  })
})
