import { existsSync, statSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DISPLAY_FONT } from '../../../src/lib/font'

describe('display font', () => {
  test('is an absolute root-relative URL', () => {
    expect(DISPLAY_FONT.startsWith('/')).toBe(true)
  })

  test('the file actually exists in public/', () => {
    expect(existsSync(`public${DISPLAY_FONT}`)).toBe(true)
  })

  test('is a non-empty font file', () => {
    expect(statSync(`public${DISPLAY_FONT}`).size).toBeGreaterThan(10_000)
  })
})
