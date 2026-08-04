import { describe, expect, test } from 'vitest'
import { morphFade, type MorphTiming } from '../../../src/hub/fade'

const TIMING: MorphTiming = { lead: 0.3, flight: 1.1, restore: 0.55 }
const TOTAL = TIMING.lead + TIMING.flight

describe('presence — when the surface is drawn', () => {
  test('a resting shape is fully drawn, before and after the envelope', () => {
    expect(morphFade(-1, TIMING).presence).toBe(1)
    expect(morphFade(0, TIMING).presence).toBe(1)
    expect(morphFade(TOTAL, TIMING).presence).toBe(1)
    expect(morphFade(TOTAL + 10, TIMING).presence).toBe(1)
  })

  test('the surface is gone by the time the vertices start moving', () => {
    // The whole point of the lead: no face is ever stretched between two
    // vertices heading for unrelated corners.
    expect(morphFade(TIMING.lead, TIMING).presence).toBe(0)
  })

  test('it stays gone until the restore begins', () => {
    const restoreStarts = TIMING.lead + TIMING.flight - TIMING.restore
    expect(morphFade(TIMING.lead + 0.01, TIMING).presence).toBe(0)
    expect(morphFade(restoreStarts, TIMING).presence).toBe(0)
  })

  test('it comes back over the flight, not after it', () => {
    // Mid-restore the vertices are still arriving — the shape materialises as
    // it lands rather than snapping on once everything has stopped.
    const midRestore = TIMING.lead + TIMING.flight - TIMING.restore / 2
    const presence = morphFade(midRestore, TIMING).presence

    expect(presence).toBeGreaterThan(0)
    expect(presence).toBeLessThan(1)
  })

  test('it only ever falls during the lead and only ever rises during the restore', () => {
    const sample = (time: number) => morphFade(time, TIMING).presence

    for (let step = 1; step <= 20; step++) {
      const time = (TIMING.lead * step) / 20
      expect(sample(time), `falling at ${time}`).toBeLessThanOrEqual(
        sample(time - TIMING.lead / 20),
      )
    }

    const restoreStarts = TIMING.lead + TIMING.flight - TIMING.restore
    for (let step = 1; step <= 20; step++) {
      const time = restoreStarts + (TIMING.restore * step) / 20
      expect(sample(time), `rising at ${time}`).toBeGreaterThanOrEqual(
        sample(time - TIMING.restore / 20),
      )
    }
  })
})

describe('blend — which accent the surface wears', () => {
  test('the colour does not move while the shape has not', () => {
    expect(morphFade(0, TIMING).blend).toBe(0)
    expect(morphFade(TIMING.lead / 2, TIMING).blend).toBe(0)
    expect(morphFade(TIMING.lead, TIMING).blend).toBe(0)
  })

  test('the colour has fully arrived by the end of the flight', () => {
    expect(morphFade(TOTAL, TIMING).blend).toBe(1)
    expect(morphFade(TOTAL + 5, TIMING).blend).toBe(1)
  })

  test('it crosses over during the flight', () => {
    const blend = morphFade(TIMING.lead + TIMING.flight / 2, TIMING).blend
    expect(blend).toBeGreaterThan(0)
    expect(blend).toBeLessThan(1)
  })
})

describe('degenerate timings', () => {
  test('no lead means the dissolve is skipped, not divided by zero', () => {
    const timing: MorphTiming = { lead: 0, flight: 1, restore: 0.5 }
    expect(Number.isFinite(morphFade(0.001, timing).presence)).toBe(true)
    expect(morphFade(0.001, timing).presence).toBe(0)
  })

  test('a restore longer than the flight fades in across the whole flight', () => {
    const timing: MorphTiming = { lead: 0.2, flight: 1, restore: 5 }
    // Never parks at zero — it is rising from the first moment of flight.
    expect(morphFade(0.2 + 0.5, timing).presence).toBeGreaterThan(0)
    expect(morphFade(0.2 + 1, timing).presence).toBe(1)
  })

  test('a zero-length flight lands immediately rather than dividing by zero', () => {
    const timing: MorphTiming = { lead: 0.2, flight: 0, restore: 0 }
    expect(morphFade(0.2, timing).presence).toBe(1)
    expect(morphFade(0.3, timing).blend).toBe(1)
  })
})
