import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import {
  eyeAt,
  facingAt,
  initialStance,
  NORTH_POLE,
  turn,
  upAt,
  walk,
  type Stance,
  type Step,
} from '../../../src/rooms/svr/walk'

const RADIUS = 6

/** Takes a run of steps in order. */
function journey(stance: Stance, ...steps: Step[]): Stance {
  return steps.reduce(walk, stance)
}

const forward = (radians: number): Step => ({ forward: radians, sideways: 0 })
const sideways = (radians: number): Step => ({ forward: 0, sideways: radians })

describe('standing still', () => {
  test('a fresh stance is at the reference point', () => {
    expect(eyeAt(initialStance(), RADIUS).distanceTo(NORTH_POLE.clone().multiplyScalar(RADIUS)))
      .toBeCloseTo(0, 10)
  })

  test('a step of nothing changes nothing', () => {
    const still = walk(initialStance(), { forward: 0, sideways: 0 })
    expect(eyeAt(still, RADIUS).distanceTo(eyeAt(initialStance(), RADIUS))).toBeCloseTo(0, 10)
  })

  test('up points at the centre, because the viewer is inside the shell', () => {
    // Standing on the inside, the middle of the sphere is overhead — which is
    // where the object being viewed hangs. Outwards would put the floor there.
    const stance = journey(initialStance(), forward(0.7), sideways(-1.1))
    const eye = eyeAt(stance, RADIUS)

    expect(upAt(stance).dot(eye.clone().normalize())).toBeCloseTo(-1, 10)
  })
})

describe('walking the surface', () => {
  test('every stance stays on the sphere', () => {
    let stance = initialStance()
    for (let i = 0; i < 400; i++) {
      stance = walk(stance, { forward: 0.11, sideways: 0.07 })
      expect(eyeAt(stance, RADIUS).length()).toBeCloseTo(RADIUS, 6)
    }
  })

  test('walking out and back returns to where it started', () => {
    const there = journey(initialStance(), forward(0.9), sideways(0.4))
    const back = journey(there, sideways(-0.4), forward(-0.9))

    expect(eyeAt(back, RADIUS).distanceTo(eyeAt(initialStance(), RADIUS))).toBeCloseTo(0, 10)
  })

  test('a full turn of arc comes back round to the start', () => {
    const round = walk(initialStance(), forward(Math.PI * 2))
    expect(eyeAt(round, RADIUS).distanceTo(eyeAt(initialStance(), RADIUS))).toBeCloseTo(0, 6)
  })

  test('half a turn lands on the far side', () => {
    const opposite = walk(initialStance(), forward(Math.PI))
    const start = eyeAt(initialStance(), RADIUS)

    expect(eyeAt(opposite, RADIUS).distanceTo(start.clone().negate())).toBeCloseTo(0, 6)
  })

  test('the orientation never drifts off unit length', () => {
    // Thousands of composed rotations accumulate float error, and a quaternion
    // that has drifted off unit length scales everything it is applied to.
    let stance = initialStance()
    for (let i = 0; i < 5000; i++) stance = walk(stance, { forward: 0.031, sideways: 0.017 })

    expect(stance.orientation.length()).toBeCloseTo(1, 10)
    expect(eyeAt(stance, RADIUS).length()).toBeCloseTo(RADIUS, 6)
  })
})

describe('the poles, where an angle-based walk would break', () => {
  /**
   * Walks straight over the top in many small steps and returns the largest
   * jump between consecutive positions.
   *
   * Latitude and longitude lose a degree of freedom at the poles, so a walk
   * built on them snaps or spins as it crosses. A quaternion has no poles to
   * cross, and the proof is that no step is bigger than the step asked for.
   */
  function largestJumpOverThePole(steps: number): number {
    const arc = (Math.PI * 1.5) / steps
    let stance = initialStance()
    let previous = eyeAt(stance, RADIUS)
    let largest = 0

    for (let i = 0; i < steps; i++) {
      stance = walk(stance, forward(arc))
      const next = eyeAt(stance, RADIUS)
      largest = Math.max(largest, previous.distanceTo(next))
      previous = next
    }

    return largest
  }

  test('crossing the pole is as smooth as any other stretch', () => {
    const steps = 300
    const arc = (Math.PI * 1.5) / steps
    // Chord length for the arc each step covers, plus a hair for float noise.
    const expected = 2 * RADIUS * Math.sin(arc / 2)

    expect(largestJumpOverThePole(steps)).toBeLessThan(expected * 1.01)
  })

  test('walking over the top and on leaves the viewer upside down', () => {
    // The honest consequence of walking a sphere's interior: half a turn later
    // your up vector is the reverse of what it was. Nothing has gone wrong.
    const start = initialStance()
    const half = walk(start, forward(Math.PI))

    expect(upAt(half).dot(upAt(start))).toBeCloseTo(-1, 6)
  })

  test('the pole itself is an ordinary point to stand on', () => {
    // Exactly a quarter turn puts the viewer on the equator of the reference
    // frame; a half puts them on the opposite pole. Neither is special.
    for (const arc of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const stance = walk(initialStance(), forward(arc))
      const eye = eyeAt(stance, RADIUS)

      expect(Number.isFinite(eye.x + eye.y + eye.z)).toBe(true)
      expect(eye.length()).toBeCloseTo(RADIUS, 6)
    }
  })

  test('sideways at the pole still moves the viewer', () => {
    // The case that pins the failure: at a pole, longitude stops meaning
    // anything, so an angle-based walk sideways moves the viewer nowhere.
    const atPole = walk(initialStance(), forward(Math.PI / 2))
    const stepped = walk(atPole, sideways(0.5))

    expect(eyeAt(stepped, RADIUS).distanceTo(eyeAt(atPole, RADIUS))).toBeGreaterThan(0.1)
  })
})

describe('turning on the spot', () => {
  test('turning does not take the viewer anywhere', () => {
    // The whole difference between turning and stepping. A rotation about any
    // other axis moves them across the surface; this one has to leave their
    // feet exactly where they were, wherever on the sphere that is.
    for (const start of [initialStance(), journey(initialStance(), forward(1.2), sideways(-0.6))]) {
      const spun = turn(start, 1.3)
      expect(eyeAt(spun, RADIUS).distanceTo(eyeAt(start, RADIUS))).toBeCloseTo(0, 9)
    }
  })

  test('turning does change which way they face', () => {
    const start = initialStance()
    expect(facingAt(turn(start, 1.3)).dot(facingAt(start))).toBeLessThan(0.99)
  })

  test('a turn of nothing is no turn at all', () => {
    const start = initialStance()
    expect(facingAt(turn(start, 0)).distanceTo(facingAt(start))).toBeCloseTo(0, 12)
  })

  test('all the way round comes back to facing the same way', () => {
    const start = initialStance()
    expect(facingAt(turn(start, Math.PI * 2)).distanceTo(facingAt(start))).toBeCloseTo(0, 6)
  })

  test('a positive turn goes to the viewer’s right', () => {
    // Their right hand, not the world's. Backwards, and every look control in
    // the room is mirrored — which reads as the drag being inverted rather than
    // as an axis being wrong, so it is worth pinning the sign.
    const start = journey(initialStance(), forward(0.8), sideways(0.5))
    const right = new Vector3().crossVectors(facingAt(start), upAt(start))

    expect(facingAt(turn(start, 0.3)).dot(right)).toBeGreaterThan(0)
  })

  test('turning keeps the viewer upright', () => {
    const start = journey(initialStance(), forward(2.1))
    expect(upAt(turn(start, 2.4)).distanceTo(upAt(start))).toBeCloseTo(0, 9)
  })

  test('a turn then a step walks the new way, not the old one', () => {
    const start = initialStance()
    const spun = turn(start, Math.PI / 2)

    const wentStraight = eyeAt(walk(start, forward(0.4)), RADIUS)
    const wentAfterTurning = eyeAt(walk(spun, forward(0.4)), RADIUS)

    expect(wentAfterTurning.distanceTo(wentStraight)).toBeGreaterThan(0.5)
  })

  test('turning never drifts off unit length', () => {
    let stance = initialStance()
    for (let i = 0; i < 5000; i++) stance = turn(stance, 0.023)

    expect(stance.orientation.length()).toBeCloseTo(1, 10)
  })
})

describe('which way the viewer faces', () => {
  test('facing is tangent to the surface, so it is a legal camera up-vector', () => {
    // The camera looks straight along the body axis at the object overhead. A
    // facing that had drifted off the tangent plane would be parallel to the
    // view direction, and three cannot build a basis out of that — the view
    // degenerates and the room flips or vanishes.
    for (const step of [forward(0.3), sideways(1.9), forward(Math.PI / 2), sideways(-2.6)]) {
      const stance = walk(initialStance(), step)
      expect(Math.abs(facingAt(stance).dot(upAt(stance)))).toBeLessThan(1e-9)
      expect(facingAt(stance).length()).toBeCloseTo(1, 10)
    }
  })

  test('facing stays tangent all the way over a pole', () => {
    let stance = initialStance()
    for (let i = 0; i < 200; i++) {
      stance = walk(stance, forward(0.05))
      expect(Math.abs(facingAt(stance).dot(upAt(stance)))).toBeLessThan(1e-9)
    }
  })

  test('walking forward travels the way the viewer is facing', () => {
    const stance = journey(initialStance(), sideways(0.8), forward(0.3))
    const facing = facingAt(stance)
    const moved = eyeAt(walk(stance, forward(0.05)), 1).sub(eyeAt(stance, 1)).normalize()

    expect(moved.dot(facing)).toBeGreaterThan(0.99)
  })
})

describe('the frame carried by a step', () => {
  test('forward and sideways move in different directions', () => {
    const start = initialStance()
    const ahead = eyeAt(walk(start, forward(0.5)), RADIUS)
    const across = eyeAt(walk(start, sideways(0.5)), RADIUS)

    expect(ahead.distanceTo(across)).toBeGreaterThan(0.5)
  })

  test('a step is taken in the viewer frame, not the world frame', () => {
    // After turning, walking "forward" has to follow where the viewer is now
    // facing. Composed on the left instead of the right, this walks along a
    // fixed world axis and the controls come unstuck from the view.
    const turned = walk(initialStance(), sideways(Math.PI / 2))
    const worldAxisStep = new Vector3(1, 0, 0)

    const moved = eyeAt(walk(turned, forward(0.4)), RADIUS)
    const ifItHadUsedTheWorldAxis = eyeAt(turned, RADIUS)
      .clone()
      .applyAxisAngle(worldAxisStep, 0.4)

    expect(moved.distanceTo(ifItHadUsedTheWorldAxis)).toBeGreaterThan(0.1)
  })
})
