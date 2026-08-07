import { describe, expect, test } from 'vitest'
import {
  ARC_PER_SECOND,
  LOOK_PER_PIXEL,
  LOOK_PER_SECOND,
  lookFrom,
  motionFrom,
} from '../../../src/rooms/controls'

const FRAME = 1 / 60

/** The keys as the browser delivers them: whatever was typed, lower-cased. */
const holding = (...keys: string[]) => new Set(keys)

describe('walking on the keyboard', () => {
  test('nothing held asks for nothing', () => {
    expect(motionFrom(holding(), FRAME)).toEqual({
      forward: 0,
      sideways: 0,
      turned: 0,
      tilted: 0,
    })
  })

  test('up walks forward and down walks back', () => {
    expect(motionFrom(holding('arrowup'), FRAME).forward).toBeCloseTo(ARC_PER_SECOND * FRAME, 12)
    expect(motionFrom(holding('arrowdown'), FRAME).forward).toBeCloseTo(-ARC_PER_SECOND * FRAME, 12)
  })

  test('w and s do the same as the arrows', () => {
    expect(motionFrom(holding('w'), FRAME)).toEqual(motionFrom(holding('arrowup'), FRAME))
    expect(motionFrom(holding('s'), FRAME)).toEqual(motionFrom(holding('arrowdown'), FRAME))
  })

  test('a and d step across rather than turning', () => {
    const left = motionFrom(holding('a'), FRAME)
    expect(left.sideways).toBeCloseTo(-ARC_PER_SECOND * FRAME, 12)
    expect(left.turned).toBe(0)
  })

  test('the left and right arrows turn rather than stepping across', () => {
    const right = motionFrom(holding('arrowright'), FRAME)
    expect(right.turned).toBeCloseTo(LOOK_PER_SECOND * FRAME, 12)
    expect(right.sideways).toBe(0)
    expect(right.forward).toBe(0)
  })

  test('page up and down tilt the head, and nothing else', () => {
    const up = motionFrom(holding('pageup'), FRAME)
    expect(up.tilted).toBeCloseTo(LOOK_PER_SECOND * FRAME, 12)
    expect(up.forward).toBe(0)
    expect(up.sideways).toBe(0)
    expect(up.turned).toBe(0)

    expect(motionFrom(holding('pagedown'), FRAME).tilted).toBeCloseTo(-LOOK_PER_SECOND * FRAME, 12)
  })

  test('there is a way to look up without a mouse', () => {
    // The room's one indispensable move. Bound to drag alone, a visitor on a
    // keyboard can walk the shell forever and never see the object.
    expect(motionFrom(holding('pageup'), FRAME).tilted).toBeGreaterThan(0)
  })

  test('opposite keys cancel instead of fighting', () => {
    const both = motionFrom(holding('arrowup', 'arrowdown'), FRAME)
    expect(both.forward).toBe(0)
    expect(motionFrom(holding('a', 'd'), FRAME).sideways).toBe(0)
  })

  test('walking and turning at once does both', () => {
    const together = motionFrom(holding('arrowup', 'arrowright'), FRAME)
    expect(together.forward).toBeGreaterThan(0)
    expect(together.turned).toBeGreaterThan(0)
  })

  test('a longer frame moves further, in proportion', () => {
    const short = motionFrom(holding('arrowup'), FRAME).forward
    const long = motionFrom(holding('arrowup'), FRAME * 4).forward
    expect(long).toBeCloseTo(short * 4, 12)
  })

  test('a room can set its own pace', () => {
    // The rooms are not the same shape: the sphere measures a step in radians
    // of arc, the corridor in metres of floor. One number cannot be both.
    const brisk = motionFrom(holding('arrowup'), FRAME, { move: 4, look: 1 })
    expect(brisk.forward).toBeCloseTo(4 * FRAME, 12)

    const turning = motionFrom(holding('arrowright'), FRAME, { move: 4, look: 2.5 })
    expect(turning.turned).toBeCloseTo(2.5 * FRAME, 12)
  })

  test('a room that says nothing walks at the default pace', () => {
    expect(motionFrom(holding('arrowup'), FRAME).forward).toBeCloseTo(ARC_PER_SECOND * FRAME, 12)
  })

  test('keys that mean nothing here mean nothing', () => {
    expect(motionFrom(holding('escape', 'shift', 'q'), FRAME)).toEqual({
      forward: 0,
      sideways: 0,
      turned: 0,
      tilted: 0,
    })
  })
})

describe('looking with a drag', () => {
  test('dragging down brings the ceiling into view', () => {
    // Which is where the object is. Inverted, the one gesture the room depends
    // on being guessable does the opposite of what a panorama does.
    expect(lookFrom(0, 120).tilted).toBeGreaterThan(0)
    expect(lookFrom(0, -120).tilted).toBeLessThan(0)
  })

  test('dragging left brings what was on the right round to the front', () => {
    expect(lookFrom(-120, 0).turned).toBeGreaterThan(0)
    expect(lookFrom(120, 0).turned).toBeLessThan(0)
  })

  test('a still hand asks for nothing', () => {
    expect(lookFrom(0, 0)).toEqual({ turned: -0, tilted: 0 })
  })

  test('a drag across most of a phone is about a right angle of look', () => {
    // Slower and the object is a chore to find; faster and a flick of the wrist
    // spins the room past it.
    const acrossAPhone = 390 * LOOK_PER_PIXEL
    expect(acrossAPhone).toBeGreaterThan(Math.PI / 4)
    expect(acrossAPhone).toBeLessThan(Math.PI / 2)
  })
})
