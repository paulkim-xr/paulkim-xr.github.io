import { describe, expect, test } from 'vitest'
import { PROFILES, unreachableFields } from '../../../src/space/coverage'
import { NO_INTENTS } from '../../../src/space/intents'
import { keysTechnique } from '../../../src/space/techniques/keys'
import { pointerTechnique } from '../../../src/space/techniques/pointer'
import type { Technique } from '../../../src/space/technique'

describe('what a device can actually ask for', () => {
  const phone = PROFILES.find((profile) => profile.name === 'phone')!
  const desktop = PROFILES.find((profile) => profile.name === 'desktop')!

  test('a phone is a pointer and nothing else', () => {
    expect(phone.signals).toEqual(['pointer'])
  })

  test('a room needing only what the pointer offers is fine on a phone', () => {
    expect(
      unreachableFields(['advance', 'yaw', 'pitch'], [keysTechnique, pointerTechnique], phone),
    ).toEqual([])
  })

  test('a room needing to strafe is not, because no pointer gesture strafes', () => {
    // This is the guard rail. A room may not ship needing something the
    // device it is opened on has no way to say.
    expect(unreachableFields(['strafe'], [keysTechnique, pointerTechnique], phone)).toEqual([
      'strafe',
    ])
  })

  test('a technique whose signals the device lacks does not count', () => {
    // The exact shape of the live defect: walking was bound to keys only, and
    // a phone has no keys, so every room was a panorama viewer on touch.
    expect(unreachableFields(['advance'], [keysTechnique], phone)).toEqual(['advance'])
    expect(unreachableFields(['advance'], [keysTechnique], desktop)).toEqual([])
  })

  test('a room offering only an exotic technique fails on a plain desktop', () => {
    // The freedom to invent locomotion is the point, and this is what stops it
    // shipping a room that only a headset can walk in.
    const rope: Technique<null> = {
      id: 'rope',
      produces: ['advance'],
      requires: ['hands'],
      initial: () => null,
      reduce: (state) => ({ state, intents: NO_INTENTS }),
    }

    expect(unreachableFields(['advance'], [rope], desktop)).toEqual(['advance'])
  })

  test('needing nothing is always satisfiable', () => {
    expect(unreachableFields([], [], phone)).toEqual([])
  })
})
