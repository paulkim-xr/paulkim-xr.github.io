import { afterEach, describe, expect, test, vi } from 'vitest'
import { browseHint, coarsePointer } from '../../../src/lib/pointer'

/** Stands in for a browser that answers media queries. */
function withMatchMedia(answers: Record<string, boolean>) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: answers[query] === true }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('coarsePointer', () => {
  test('is true when the primary pointer is a finger', () => {
    withMatchMedia({ '(pointer: coarse)': true })
    expect(coarsePointer()).toBe(true)
  })

  test('is false for a mouse', () => {
    withMatchMedia({ '(pointer: coarse)': false })
    expect(coarsePointer()).toBe(false)
  })

  test('assumes a mouse where media queries cannot be asked', () => {
    // Server-side rendering, and older test environments. Guessing "touch"
    // here would put swipe instructions on every desktop that failed to answer.
    vi.stubGlobal('matchMedia', undefined)
    expect(coarsePointer()).toBe(false)
  })
})

describe('browseHint', () => {
  test('names gestures on touch and keys on a mouse', () => {
    expect(browseHint(true)).toBe('swipe to browse · tap to enter')
    expect(browseHint(false)).toBe('← → to browse · click to enter')
  })

  test('never tells a phone about arrow keys or clicking', () => {
    const touch = browseHint(true)

    expect(touch).not.toMatch(/→|←/)
    expect(touch).not.toMatch(/click/)
  })
})
