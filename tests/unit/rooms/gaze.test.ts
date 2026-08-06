import { describe, expect, test } from 'vitest'
import { clampPitch, gazeAt, headUpAt, MAX_PITCH } from '../../../src/rooms/svr/gaze'
import { eyeAt, facingAt, initialStance, upAt, walk, turn, type Stance } from '../../../src/rooms/svr/walk'

const RADIUS = 9
const EYE_HEIGHT = 1.65

/** A spread of places to stand, so nothing here is true only at the origin. */
const ANYWHERE: Stance[] = [
  initialStance(),
  walk(initialStance(), { forward: 0.4, sideways: 0 }),
  turn(walk(initialStance(), { forward: 1.9, sideways: 0.7 }), 2.2),
  walk(initialStance(), { forward: Math.PI / 2, sideways: 0 }),
  walk(initialStance(), { forward: Math.PI * 0.9, sideways: -1.3 }),
]

const PITCHES = [-MAX_PITCH, -1.1, -0.4, 0, 0.3, 0.9, 1.4, MAX_PITCH]

describe('standing and looking at the room', () => {
  test('a viewer at rest looks at the horizon, not at the object', () => {
    // The point of the room. Standing on the inside of a sphere, the object is
    // straight overhead — so a gaze that is level has to be square to the body
    // axis, and the thing they came to see is out of frame until they look up.
    for (const stance of ANYWHERE) {
      const towardsTheObject = eyeAt(stance, 1).negate()
      expect(Math.abs(gazeAt(stance, 0).dot(towardsTheObject))).toBeLessThan(1e-9)
    }
  })

  test('a level gaze is the way the viewer is walking', () => {
    for (const stance of ANYWHERE) {
      expect(gazeAt(stance, 0).distanceTo(facingAt(stance))).toBeCloseTo(0, 10)
    }
  })

  test('looking all the way up lands on the object at the centre', () => {
    // Not "somewhere above" — the ray from the eye has to actually reach the
    // middle of the room, or looking up finds an empty patch of ceiling.
    for (const stance of ANYWHERE) {
      const eye = eyeAt(stance, RADIUS - EYE_HEIGHT)
      const arrival = eye.clone().addScaledVector(gazeAt(stance, MAX_PITCH), eye.length())

      expect(arrival.length()).toBeCloseTo(0, 6)
    }
  })

  test('looking all the way down lands on the floor underfoot', () => {
    for (const stance of ANYWHERE) {
      const eye = eyeAt(stance, RADIUS - EYE_HEIGHT)
      expect(gazeAt(stance, -MAX_PITCH).dot(eye.clone().normalize())).toBeCloseTo(1, 6)
    }
  })

  test('tilting the head moves the gaze off the horizon by the angle asked for', () => {
    for (const stance of ANYWHERE) {
      for (const pitch of PITCHES) {
        const towardsTheObject = eyeAt(stance, 1).negate()
        expect(gazeAt(stance, pitch).dot(towardsTheObject)).toBeCloseTo(Math.sin(pitch), 9)
      }
    }
  })
})

describe('the frame the head carries', () => {
  test('gaze and head-up stay exactly perpendicular at every tilt', () => {
    // A camera builds its basis from the cross product of these two. Left as
    // the body's up-vector while the gaze swings towards it, that product
    // collapses at the top of the arc — which is exactly where the viewer is
    // looking when they look at the object, so the picture rolls over and falls
    // apart at the one moment the room is about.
    for (const stance of ANYWHERE) {
      for (const pitch of PITCHES) {
        expect(Math.abs(gazeAt(stance, pitch).dot(headUpAt(stance, pitch)))).toBeLessThan(1e-9)
      }
    }
  })

  test('both stay unit length at every tilt', () => {
    for (const stance of ANYWHERE) {
      for (const pitch of PITCHES) {
        expect(gazeAt(stance, pitch).length()).toBeCloseTo(1, 10)
        expect(headUpAt(stance, pitch).length()).toBeCloseTo(1, 10)
      }
    }
  })

  test('a level head is upright in the body', () => {
    for (const stance of ANYWHERE) {
      expect(headUpAt(stance, 0).distanceTo(upAt(stance))).toBeCloseTo(0, 10)
    }
  })

  test('looking straight up puts what is behind you at the top of the frame', () => {
    // The framing the room used to open on, now reached by tilting all the way
    // back rather than baked into the camera.
    for (const stance of ANYWHERE) {
      expect(headUpAt(stance, MAX_PITCH).distanceTo(facingAt(stance).negate())).toBeCloseTo(0, 9)
    }
  })
})

describe('how far a neck goes', () => {
  test('straight up is as far as it goes', () => {
    expect(clampPitch(MAX_PITCH + 1)).toBe(MAX_PITCH)
    expect(clampPitch(-MAX_PITCH - 1)).toBe(-MAX_PITCH)
    expect(clampPitch(Math.PI * 4)).toBe(MAX_PITCH)
  })

  test('anything reachable is left alone', () => {
    for (const pitch of PITCHES) expect(clampPitch(pitch)).toBeCloseTo(pitch, 12)
  })

  test('a gaze past the limit is the gaze at the limit, not the far side of it', () => {
    // Unclamped, tilting past vertical carries on over the back of the head and
    // the viewer ends up looking behind themselves with the room inverted.
    const stance = ANYWHERE[2]
    expect(gazeAt(stance, MAX_PITCH + 0.8).distanceTo(gazeAt(stance, MAX_PITCH))).toBeCloseTo(0, 10)
  })
})
