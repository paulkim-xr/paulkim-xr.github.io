import { describe, expect, test } from 'vitest'
import type { Direction, Phase } from '../../../src/transition/machine'
import { durationFor, whiteoutAt } from '../../../src/transition/whiteout'

/**
 * Everything before the room is put in place — the stretch over which the view
 * must only ever become more covered, never less.
 */
const UP_TO_THE_SWAP: Phase[] = ['focusing', 'masking', 'swapping']

/** Samples one phase end to end, inclusive of both edges. */
function sweep(phase: Phase, direction: Direction, steps = 24) {
  return Array.from({ length: steps + 1 }, (_, i) => whiteoutAt(phase, direction, i / steps))
}

/** The whole sequence sampled as one list, in the order it is played. */
function sequence(phases: Phase[], direction: Direction) {
  return phases.flatMap((phase) => sweep(phase, direction))
}

/** Asserts a run of samples never goes backwards. */
function expectNonDecreasing(samples: number[], subject: string) {
  for (const [i, value] of samples.entries()) {
    if (i === 0) continue
    expect(value, `${subject} went backwards at sample ${i}`).toBeGreaterThanOrEqual(
      samples[i - 1],
    )
  }
}

describe('at rest', () => {
  test('browsing and being in a room are both untouched', () => {
    for (const phase of ['browsing', 'inRoom'] as const) {
      expect(whiteoutAt(phase, 'in', 0.5)).toEqual({ whiten: 0, swell: 1, sheet: 0 })
    }
  })

  test('a resting phase has no duration, so nothing progresses through it', () => {
    expect(durationFor('browsing')).toBe(Infinity)
    expect(durationFor('inRoom')).toBe(Infinity)
  })

  test('every animated phase has a real duration', () => {
    for (const phase of ['focusing', 'masking', 'revealing'] as const) {
      expect(durationFor(phase)).toBeGreaterThan(0)
      expect(durationFor(phase)).toBeLessThan(Infinity)
    }
  })
})

describe('picking a project', () => {
  test('the focus beat whitens the shape without covering anything', () => {
    const beat = sweep('focusing', 'in')

    expect(beat[0].whiten).toBe(0)
    expect(beat.at(-1)?.whiten).toBe(1)
    // The sheet is insurance for later. Nothing is hidden while the viewer is
    // still watching the thing they picked turn white.
    expect(beat.every((frame) => frame.sheet === 0)).toBe(true)
  })

  test('the shape grows until it has swallowed the camera', () => {
    const beat = sweep('masking', 'in')

    // The camera sits ~3.3 out and the shape's own reach is ~1.4, so anything
    // past ~2.4 has the viewer inside it rather than looking at it.
    expect(beat.at(-1)?.swell).toBeGreaterThan(5)
    expect(beat.at(-1)?.whiten).toBe(1)
  })

  test('the sheet holds off until the shape is already past the frame', () => {
    // The sheet exists to plug the gaps between wires, not to be the effect. If
    // it started with the beat it would simply be a white fade with a shape
    // somewhere behind it.
    expect(whiteoutAt('masking', 'in', 0.3).sheet).toBe(0)
    expect(whiteoutAt('masking', 'in', 1).sheet).toBe(1)
  })

  test('the view is fully covered by the time the scene is swapped in', () => {
    expect(whiteoutAt('swapping', 'in', 0)).toEqual(whiteoutAt('swapping', 'in', 1))
    expect(whiteoutAt('swapping', 'in', 0.5).sheet).toBe(1)
  })

  test('the room is revealed by the white lifting, not by a shape shrinking', () => {
    const beat = sweep('revealing', 'in')

    expect(beat[0].sheet).toBe(1)
    expect(beat.at(-1)?.sheet).toBe(0)
    // The hub is unmounted by now; anything it did here would be invisible, and
    // pretending otherwise would be a lie in the numbers.
    expect(beat.every((frame) => frame.whiten === 1)).toBe(true)
  })

  test('coverage never dips part-way through, which would flash the hub', () => {
    // Up to the swap only. The reveal is where it is supposed to come back down.
    expectNonDecreasing(
      sequence(UP_TO_THE_SWAP, 'in').map((frame) => frame.sheet),
      'coverage',
    )
  })

  test('the shape only ever grows on the way in', () => {
    expectNonDecreasing(
      sequence(UP_TO_THE_SWAP, 'in').map((frame) => frame.swell),
      'the shape',
    )
  })
})

describe('leaving a room', () => {
  test('the sheet closes on its own, with no shape to grow', () => {
    const beat = sweep('masking', 'out')

    expect(beat[0].sheet).toBe(0)
    expect(beat.at(-1)?.sheet).toBe(1)
  })

  test('the hub comes back by shrinking out of the white', () => {
    const beat = sweep('revealing', 'out')

    // The way in, played backwards: enormous and white, down to the resting
    // shape in its own colour.
    expect(beat[0].swell).toBeGreaterThan(5)
    expect(beat[0].whiten).toBe(1)
    expect(beat.at(-1)?.swell).toBeCloseTo(1, 5)
    expect(beat.at(-1)?.whiten).toBe(0)
  })

  test('the hub is never briefly visible before the white has closed over it', () => {
    for (const frame of sweep('masking', 'out')) {
      expect(frame.whiten).toBe(1)
    }
  })

  test('coverage never dips on the way out either', () => {
    // Leaving never focuses, so the run starts at the mask.
    expectNonDecreasing(
      sequence(['masking', 'swapping'], 'out').map((frame) => frame.sheet),
      'coverage',
    )
  })
})

describe('progress outside the beat', () => {
  test('clamps rather than overshooting, so a dropped frame cannot break it', () => {
    // A tab left in the background resumes with a huge delta. The envelope has
    // to read that as "the beat is over", not as a shape scaled to a thousand.
    expect(whiteoutAt('masking', 'in', 40)).toEqual(whiteoutAt('masking', 'in', 1))
    expect(whiteoutAt('revealing', 'in', -3)).toEqual(whiteoutAt('revealing', 'in', 0))
  })
})
