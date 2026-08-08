import { describe, expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { ARC_PER_SECOND, shellDomain } from '../../../../src/space/domains/shell'
import { eyeAt, facingAt, upAt } from '../../../../src/rooms/svr/walk'
import { gazeAt, headUpAt, MAX_PITCH } from '../../../../src/rooms/svr/gaze'

const RADIUS = 9
const EYE_HEIGHT = 1.65
const shell = shellDomain(RADIUS, EYE_HEIGHT)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

/** The rotation the rig builds: the body's, tilted about its own +X. */
function tilted(orientation: Quaternion, pitch: number): Quaternion {
  return orientation
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
}

describe('walking the inside of a shell', () => {
  test('opens standing still', () => {
    const state = shell.initial()
    expect(state.pitch).toBe(0)
    expect(shell.step(state, NO_INTENTS, 1 / 60)).toEqual(state)
  })

  test('a full second of forward is one second of arc', () => {
    // The domain owns the pace. The technique only said "forward, fully".
    const walked = shell.step(shell.initial(), asking({ advance: 1 }), 1)
    const travelled = eyeAt(walked.stance, RADIUS).angleTo(eyeAt(shell.initial().stance, RADIUS))

    expect(travelled).toBeCloseTo(ARC_PER_SECOND, 6)
  })

  test('half the demand is half the arc', () => {
    const half = shell.step(shell.initial(), asking({ advance: 0.5 }), 1)
    const travelled = eyeAt(half.stance, RADIUS).angleTo(eyeAt(shell.initial().stance, RADIUS))

    expect(travelled).toBeCloseTo(ARC_PER_SECOND / 2, 6)
  })

  test('turning is applied as the radians it already is', () => {
    const turned = shell.step(shell.initial(), asking({ yaw: 0.4 }), 1 / 60)
    expect(facingAt(turned.stance).angleTo(facingAt(shell.initial().stance))).toBeCloseTo(0.4, 6)
  })

  test('turning on the spot does not move the feet', () => {
    const turned = shell.step(shell.initial(), asking({ yaw: 1.2 }), 1 / 60)
    expect(
      eyeAt(turned.stance, RADIUS).distanceTo(eyeAt(shell.initial().stance, RADIUS)),
    ).toBeCloseTo(0, 9)
  })

  test('the head can only tilt so far back', () => {
    let state = shell.initial()
    for (let frame = 0; frame < 200; frame++) {
      state = shell.step(state, asking({ pitch: 0.1 }), 1 / 60)
    }

    expect(shell.pitchOf(state)).toBeCloseTo(MAX_PITCH, 9)
  })

  test('it never modifies the state it was given', () => {
    const state = shell.initial()
    const before = eyeAt(state.stance, RADIUS)
    shell.step(state, asking({ advance: 1, yaw: 1 }), 1)

    expect(eyeAt(state.stance, RADIUS).distanceTo(before)).toBe(0)
  })
})

describe('the pose it hands the rig', () => {
  test('puts the eyes a head below the shell', () => {
    expect(shell.poseOf(shell.initial()).position.length()).toBeCloseTo(RADIUS - EYE_HEIGHT, 6)
  })

  test('agrees with the room optics it replaces', () => {
    // The rig applies pitch as a local rotation about +X. This asserts that is
    // the same thing gazeAt and headUpAt were computing, at every tilt and
    // after walking somewhere up is nowhere near world up. Get the axis or its
    // sign wrong and looking up looks down.
    let state = shell.step(shell.initial(), asking({ advance: 1, strafe: 0.4 }), 1)
    state = shell.step(state, asking({ yaw: 0.9 }), 1 / 60)

    for (const pitch of [-MAX_PITCH, -0.7, 0, 0.35, MAX_PITCH]) {
      const head = tilted(shell.poseOf({ ...state, pitch }).orientation, pitch)

      expect(
        new Vector3(0, 0, -1).applyQuaternion(head).distanceTo(gazeAt(state.stance, pitch)),
        `gaze at pitch ${pitch}`,
      ).toBeCloseTo(0, 6)

      expect(
        new Vector3(0, 1, 0).applyQuaternion(head).distanceTo(headUpAt(state.stance, pitch)),
        `up at pitch ${pitch}`,
      ).toBeCloseTo(0, 6)
    }
  })

  test('its up points at the centre of the room, not at world up', () => {
    const state = shell.step(shell.initial(), asking({ advance: 1 }), 1.4)
    const up = new Vector3(0, 1, 0).applyQuaternion(shell.poseOf(state).orientation)

    expect(up.distanceTo(upAt(state.stance))).toBeCloseTo(0, 6)
    expect(up.distanceTo(new Vector3(0, 1, 0))).toBeGreaterThan(0.2)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to walk, turn and look up', () => {
    // Looking up is not optional here: the thing the room is about hangs at
    // the centre, over the viewer's head.
    expect([...shell.needs].sort()).toEqual(['advance', 'pitch', 'yaw'])
  })

  test('it does not need to strafe', () => {
    expect(shell.needs).not.toContain('strafe')
  })
})
