import { describe, expect, test } from 'vitest'
import { angleStep, ringPositions, shortestDelta, targetRotation } from '../../../src/hub/ring'

describe('angleStep', () => {
  test('divides the circle evenly', () => {
    expect(angleStep(4)).toBeCloseTo(Math.PI / 2)
    expect(angleStep(5)).toBeCloseTo((Math.PI * 2) / 5)
  })

  test('returns zero for a degenerate ring', () => {
    expect(angleStep(0)).toBe(0)
    expect(angleStep(1)).toBe(0)
  })
})

describe('ringPositions', () => {
  test('returns one position per item', () => {
    expect(ringPositions(5, 3)).toHaveLength(5)
  })

  test('places item 0 nearest the camera on +Z', () => {
    const [first] = ringPositions(5, 3)
    expect(first[0]).toBeCloseTo(0)
    expect(first[1]).toBeCloseTo(0)
    expect(first[2]).toBeCloseTo(3)
  })

  test('keeps every item on the ring radius', () => {
    for (const [x, , z] of ringPositions(7, 2.5)) {
      expect(Math.hypot(x, z)).toBeCloseTo(2.5)
    }
  })

  test('places items in the XZ plane at y = 0', () => {
    for (const [, y] of ringPositions(5, 3)) expect(y).toBe(0)
  })
})

describe('shortestDelta', () => {
  test('is zero for the same index', () => {
    expect(shortestDelta(2, 2, 5)).toBe(0)
  })

  test('steps forward when that is shorter', () => {
    expect(shortestDelta(0, 1, 5)).toBe(1)
  })

  test('wraps backward rather than crossing the whole ring', () => {
    // 0 -> 4 of 5 is one step backwards, not four forwards.
    expect(shortestDelta(0, 4, 5)).toBe(-1)
  })

  test('wraps forward across the seam', () => {
    expect(shortestDelta(4, 0, 5)).toBe(1)
  })
})

describe('targetRotation', () => {
  test('does not unwind a full turn to reach a neighbour', () => {
    const step = angleStep(5)
    // Currently showing index 0. Selecting index 4 should rotate by one step,
    // not by four.
    const rotation = targetRotation(0, 4, 5)
    expect(Math.abs(rotation)).toBeCloseTo(step)
  })

  test('advancing one index rotates by exactly one step, negatively', () => {
    const step = angleStep(5)
    const first = targetRotation(0, 1, 5)
    const second = targetRotation(first, 2, 5)
    // Item 0 sits at +Z, so bringing a later item to the front rotates the
    // ring the negative way. What matters is the magnitude and consistency.
    expect(first).toBeCloseTo(-step)
    expect(second - first).toBeCloseTo(-step)
  })

  test('accumulates around a full loop instead of snapping back at the seam', () => {
    const step = angleStep(5)
    let rotation = 0
    const deltas: number[] = []

    // 0 -> 1 -> 2 -> 3 -> 4 -> 0. The last hop crosses the seam and is the one
    // a naive implementation unwinds by four steps.
    for (const index of [1, 2, 3, 4, 0]) {
      const next = targetRotation(rotation, index, 5)
      deltas.push(next - rotation)
      rotation = next
    }

    for (const delta of deltas) expect(delta).toBeCloseTo(-step)
    expect(rotation).toBeCloseTo(-step * 5)
  })
})
