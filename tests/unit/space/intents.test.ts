import { describe, expect, test } from 'vitest'
import { NO_INTENTS, sumIntents, type Intents } from '../../../src/space/intents'

const demanding = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('summing what the techniques asked for', () => {
  test('nothing asked for is nothing done', () => {
    expect(sumIntents([])).toEqual(NO_INTENTS)
  })

  test('two techniques pushing the same way add up', () => {
    // Radians, so they are the same quantity by the time they are intents:
    // a held key integrated over a frame and a drag measured in pixels.
    const summed = sumIntents([demanding({ yaw: 0.2 }), demanding({ yaw: 0.05 })])
    expect(summed.yaw).toBeCloseTo(0.25, 12)
  })

  test('two techniques pushing opposite ways cancel', () => {
    expect(sumIntents([demanding({ advance: 1 }), demanding({ advance: -1 })]).advance).toBe(0)
  })

  test('movement is clamped, because it is a normalised demand', () => {
    // A stick and a key and a rope all asking to go forward is still forward,
    // not triple speed. The domain multiplies this by its own pace.
    const summed = sumIntents([
      demanding({ advance: 1 }),
      demanding({ advance: 1 }),
      demanding({ advance: 1 }),
    ])
    expect(summed.advance).toBe(1)
    expect(sumIntents([demanding({ strafe: -4 })]).strafe).toBe(-1)
  })

  test('turning is not clamped, because it is an absolute angle', () => {
    // Clamping radians would silently cap how far a fast drag may turn you.
    expect(sumIntents([demanding({ yaw: 3 }), demanding({ yaw: 3 })]).yaw).toBe(6)
  })

  test('an edge from any one technique fires the edge', () => {
    expect(sumIntents([NO_INTENTS, demanding({ act: true })]).act).toBe(true)
    expect(sumIntents([demanding({ leave: true }), NO_INTENTS]).leave).toBe(true)
  })

  test('summing does not modify what it was given', () => {
    const part = demanding({ advance: 1 })
    sumIntents([part, demanding({ advance: 1 })])
    expect(part.advance).toBe(1)
  })
})
