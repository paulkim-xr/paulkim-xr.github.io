import { describe, expect, test } from 'vitest'
import { NO_INTENTS } from '../../../src/space/intents'
import { DWELL_MS, idleGesture, SLOP_PX, type Press } from '../../../src/space/gesture'
import { runTechniques, type Signals, type Technique } from '../../../src/space/technique'
import { keysTechnique, LOOK_PER_SECOND } from '../../../src/space/techniques/keys'
import { LOOK_PER_PIXEL, pointerTechnique } from '../../../src/space/techniques/pointer'

const signals = (part: Partial<Signals> = {}): Signals => ({
  keys: new Set<string>(),
  presses: [],
  now: 0,
  ...part,
})

const FRAME = 1 / 60

describe('the keyboard', () => {
  test('w and the up arrow both walk forward', () => {
    for (const key of ['w', 'arrowup']) {
      const { intents } = keysTechnique.reduce(null, signals({ keys: new Set([key]) }), FRAME)
      expect(intents.advance, key).toBe(1)
    }
  })

  test('forward and back at once is standing still', () => {
    const { intents } = keysTechnique.reduce(null, signals({ keys: new Set(['w', 's']) }), FRAME)
    expect(intents.advance).toBe(0)
  })

  test('walking is a normalised demand, not a distance', () => {
    // The domain owns the pace, because a step is radians of arc on a shell
    // and metres of floor in a corridor and one number cannot be both.
    const slow = keysTechnique.reduce(null, signals({ keys: new Set(['w']) }), FRAME)
    const long = keysTechnique.reduce(null, signals({ keys: new Set(['w']) }), FRAME * 10)
    expect(slow.intents.advance).toBe(long.intents.advance)
  })

  test('turning is radians, so it does depend on the frame', () => {
    const { intents } = keysTechnique.reduce(
      null,
      signals({ keys: new Set(['arrowright']) }),
      FRAME,
    )
    expect(intents.yaw).toBeCloseTo(LOOK_PER_SECOND * FRAME, 12)
  })

  test('a held key is matched however shift and caps lock left it', () => {
    // `event.key` for a letter is the letter typed, so the same physical key
    // arrives as `w` or `W`. A walk that stops when you hold shift is a bug
    // nobody thinks to look for.
    const { intents } = keysTechnique.reduce(null, signals({ keys: new Set(['W']) }), FRAME)
    expect(intents.advance).toBe(1)
  })

  test('escape asks to leave and space acts', () => {
    expect(
      keysTechnique.reduce(null, signals({ keys: new Set(['escape']) }), FRAME).intents.leave,
    ).toBe(true)
    expect(keysTechnique.reduce(null, signals({ keys: new Set([' ']) }), FRAME).intents.act).toBe(
      true,
    )
  })

  test('nothing held asks for nothing', () => {
    expect(keysTechnique.reduce(null, signals(), FRAME).intents).toEqual(NO_INTENTS)
  })
})

describe('the pointer', () => {
  const press = (presses: Press[], seconds = FRAME) =>
    pointerTechnique.reduce(idleGesture(), signals({ presses }), seconds)

  test('a drag turns and tilts', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: SLOP_PX + 100, y: 40, at: 20 },
    ])

    // Dragging pulls the room past the viewer, the way dragging a panorama
    // does, so a drag to the left brings what was on the right to the front.
    expect(intents.yaw).toBeCloseTo(-(SLOP_PX + 100) * LOOK_PER_PIXEL, 9)
    expect(intents.pitch).toBeCloseTo(40 * LOOK_PER_PIXEL, 9)
    expect(intents.advance).toBe(0)
  })

  test('a held press walks, and asks for full speed', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(intents.advance).toBe(1)
    expect(intents.yaw).toBe(0)
  })

  test('a tap acts', () => {
    const { intents } = press([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'up', at: 40 },
    ])

    expect(intents.act).toBe(true)
    expect(intents.advance).toBe(0)
  })

  test('it carries its gesture across frames', () => {
    // The dwell spans many frames, so the machine's state has to survive them.
    const first = pointerTechnique.reduce(
      idleGesture(),
      signals({ presses: [{ kind: 'down', x: 0, y: 0, at: 0 }] }),
      FRAME,
    )
    const later = pointerTechnique.reduce(
      first.state,
      signals({ presses: [{ kind: 'tick', at: DWELL_MS + 1 }] }),
      FRAME,
    )

    expect(later.intents.advance).toBe(1)
  })
})

describe('what a technique declares about itself', () => {
  test('the pointer alone can produce everything a phone needs to move', () => {
    for (const field of ['advance', 'yaw', 'pitch', 'act'] as const) {
      expect(pointerTechnique.produces).toContain(field)
    }
    expect(pointerTechnique.requires).toEqual(['pointer'])
  })

  test('the keyboard declares the keys it needs', () => {
    expect(keysTechnique.requires).toEqual(['keys'])
  })
})

describe('running several techniques together', () => {
  const still: Technique<null> = {
    id: 'still',
    produces: [],
    requires: [],
    initial: () => null,
    reduce: (state) => ({ state, intents: NO_INTENTS }),
  }

  test('their demands are summed, so no mode has to be switched', () => {
    const { intents } = runTechniques(
      [keysTechnique, pointerTechnique],
      [null, idleGesture()],
      signals({
        keys: new Set(['w']),
        presses: [
          { kind: 'down', x: 0, y: 0, at: 0 },
          { kind: 'move', x: SLOP_PX + 60, y: 0, at: 10 },
        ],
      }),
      FRAME,
    )

    expect(intents.advance).toBe(1)
    expect(intents.yaw).toBeLessThan(0)
  })

  test('each technique gets its own state back, in order', () => {
    const { states } = runTechniques([still, keysTechnique], [null, null], signals(), FRAME)
    expect(states).toHaveLength(2)
  })
})
