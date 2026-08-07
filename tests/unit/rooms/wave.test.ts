import { describe, expect, test } from 'vitest'
import {
  AMPLITUDE,
  crossingTime,
  displacementAt,
  envelopeAt,
  hasArrived,
  headAt,
  SPEED,
  stillTravelling,
  WIDTH,
  type Pulse,
} from '../../../src/rooms/papercup/wave'

const SPAN = 24

const outbound = (firedAt = 0): Pulse => ({ firedAt, direction: 1 })
const inbound = (firedAt = 0): Pulse => ({ firedAt, direction: -1 })

describe('a pulse crossing the room', () => {
  test('starts at the cup it was spoken into', () => {
    expect(headAt(outbound(), 0, SPAN)).toBeCloseTo(-SPAN / 2, 10)
    expect(headAt(inbound(), 0, SPAN)).toBeCloseTo(SPAN / 2, 10)
  })

  test('travels at the speed it says it does', () => {
    expect(headAt(outbound(), 1, SPAN)).toBeCloseTo(-SPAN / 2 + SPEED, 10)
    expect(headAt(inbound(), 1, SPAN)).toBeCloseTo(SPAN / 2 - SPEED, 10)
  })

  test('a reply runs the other way', () => {
    // Not the same pulse rebounding: the far end answers. If both directions
    // started from the same cup the room would be one person shouting.
    expect(headAt(outbound(), 0.5, SPAN)).toBeLessThan(headAt(outbound(), 1, SPAN))
    expect(headAt(inbound(), 0.5, SPAN)).toBeGreaterThan(headAt(inbound(), 1, SPAN))
  })

  test('has not left before it was fired', () => {
    // Time runs from whenever the room was entered, so a pulse can be asked
    // about before its own moment. It should be sitting at the cup, not
    // somewhere off the far end of the string.
    expect(headAt(outbound(5), 2, SPAN)).toBeCloseTo(-SPAN / 2, 10)
  })

  test('arrives after exactly the crossing time', () => {
    const pulse = outbound()
    expect(hasArrived(pulse, crossingTime(SPAN) - 0.01, SPAN)).toBe(false)
    expect(hasArrived(pulse, crossingTime(SPAN) + 0.01, SPAN)).toBe(true)
  })

  test('the crossing is long enough to watch', () => {
    // The room exists to make a message take time to cross a distance. Fast
    // enough and it is a flash, which is the thing this is not.
    expect(crossingTime(SPAN)).toBeGreaterThan(1.5)
  })
})

describe('the shape of a packet', () => {
  test('is tallest at its middle', () => {
    expect(envelopeAt(0)).toBeCloseTo(1, 10)
  })

  test('reaches exactly nothing at its edges', () => {
    // Not merely small. Anything else and the whole string is permanently
    // trembling instead of being still where nothing is passing.
    expect(envelopeAt(1)).toBe(0)
    expect(envelopeAt(-1)).toBe(0)
    expect(envelopeAt(4)).toBe(0)
  })

  test('leaves zero without a step in it', () => {
    // A packet whose edge arrives with slope would snap the string as it
    // passed. The gradient has to die out along with the height.
    const justInside = envelopeAt(0.999)
    expect(justInside).toBeGreaterThan(0)
    expect(justInside).toBeLessThan(1e-5)
  })

  test('is symmetric', () => {
    for (const offset of [0.2, 0.5, 0.9]) {
      expect(envelopeAt(offset)).toBeCloseTo(envelopeAt(-offset), 12)
    }
  })
})

describe('what the string is doing', () => {
  test('is still when nothing has been sent', () => {
    for (const x of [-10, -3, 0, 3, 10]) {
      expect(displacementAt(x, [], 1, SPAN)).toBe(0)
    }
  })

  test('is pulled aside where the pulse is, and nowhere else', () => {
    const pulse = outbound()
    const now = 1
    const head = headAt(pulse, now, SPAN)

    expect(displacementAt(head, [pulse], now, SPAN)).toBeCloseTo(AMPLITUDE, 10)
    expect(displacementAt(head + WIDTH * 1.5, [pulse], now, SPAN)).toBe(0)
    expect(displacementAt(head - WIDTH * 1.5, [pulse], now, SPAN)).toBe(0)
  })

  test('the far end of the room stays still while a pulse is near this one', () => {
    // What makes it read as something crossing a distance rather than as the
    // whole string humming at once.
    const pulse = outbound()
    expect(displacementAt(SPAN / 2, [pulse], 0.1, SPAN)).toBe(0)
  })

  test('two pulses passing pile up where they meet', () => {
    // They cross in the middle at half the crossing time, both being there at
    // once, so the string is pulled twice as far aside for that instant.
    const meeting = crossingTime(SPAN) / 2
    const together = displacementAt(0, [outbound(), inbound()], meeting, SPAN)

    expect(together).toBeCloseTo(AMPLITUDE * 2, 6)
  })

  test('and come out of each other unchanged', () => {
    const pulses = [outbound(), inbound()]
    const later = crossingTime(SPAN) * 0.75
    const alone = displacementAt(headAt(pulses[0], later, SPAN), [pulses[0]], later, SPAN)
    const crossed = displacementAt(headAt(pulses[0], later, SPAN), pulses, later, SPAN)

    expect(crossed).toBeCloseTo(alone, 10)
  })

  test('nothing is left on the string once a pulse has arrived', () => {
    const pulse = outbound()
    const after = crossingTime(SPAN) + 1

    for (const x of [-SPAN / 2, 0, SPAN / 2]) {
      expect(displacementAt(x, [pulse], after, SPAN)).toBe(0)
    }
  })
})

describe('keeping the string tidy', () => {
  test('drops what has arrived and keeps what has not', () => {
    const gone = outbound(0)
    const going = outbound(crossingTime(SPAN))
    const now = crossingTime(SPAN) + 0.2

    expect(stillTravelling([gone, going], now, SPAN)).toEqual([going])
  })

  test('holds on to everything mid-flight', () => {
    const pulses = [outbound(0), inbound(0.2)]
    expect(stillTravelling(pulses, 0.5, SPAN)).toEqual(pulses)
  })

  test('an empty string stays empty', () => {
    expect(stillTravelling([], 3, SPAN)).toEqual([])
  })
})
