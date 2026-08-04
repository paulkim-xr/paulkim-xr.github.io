import { describe, expect, test } from 'vitest'
import { damp } from '../../../src/lib/damp'

describe('damp', () => {
  test('returns the current value when dt is zero', () => {
    expect(damp(2, 10, 5, 0)).toBe(2)
  })

  test('moves toward the target but never past it', () => {
    const result = damp(0, 10, 5, 0.016)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(10)
  })

  test('converges to the target over many frames', () => {
    let value = 0
    for (let i = 0; i < 200; i++) value = damp(value, 10, 5, 0.016)
    expect(value).toBeCloseTo(10, 3)
  })

  test('is frame-rate independent: one big step matches many small ones', () => {
    const oneStep = damp(0, 10, 5, 0.1)

    let many = 0
    for (let i = 0; i < 10; i++) many = damp(many, 10, 5, 0.01)

    expect(oneStep).toBeCloseTo(many, 6)
  })
})
