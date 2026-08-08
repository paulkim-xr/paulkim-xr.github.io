import { describe, expect, test } from 'vitest'
import { Vector3 } from 'three'
import { NO_INTENTS, type Intents } from '../../../../src/space/intents'
import { corridorDomain, METRES_PER_SECOND } from '../../../../src/space/domains/corridor'
import { facingOf, rightOf, type Bounds } from '../../../../src/rooms/papercup/stroll'
import { shellDomain } from '../../../../src/space/domains/shell'
import { facingAt, upAt } from '../../../../src/rooms/svr/walk'

const ROOM: Bounds = { alongString: 8.2, acrossString: 2 }
const START = { x: -6.5, z: 1.2, heading: -0.1 }
const EYE_HEIGHT = 1.62
const corridor = corridorDomain(ROOM, START, EYE_HEIGHT)
const asking = (part: Partial<Intents>): Intents => ({ ...NO_INTENTS, ...part })

describe('walking a corridor', () => {
  test('opens where the room said to arrive', () => {
    const pose = corridor.poseOf(corridor.initial())
    expect(pose.position.x).toBeCloseTo(START.x, 9)
    expect(pose.position.z).toBeCloseTo(START.z, 9)
  })

  test('the eyes are a head above the floor', () => {
    expect(corridor.poseOf(corridor.initial()).position.y).toBeCloseTo(EYE_HEIGHT, 9)
  })

  test('a full second of forward is metres, not radians', () => {
    // The same demand the shell reads as arc. That is the point of normalising.
    const walked = corridor.step(corridor.initial(), asking({ advance: 1 }), 1)
    const travelled = walked.stroll.position.distanceTo(corridor.initial().stroll.position)

    expect(travelled).toBeCloseTo(METRES_PER_SECOND, 6)
  })

  test('the walls stop the viewer', () => {
    let state = corridor.initial()
    for (let frame = 0; frame < 600; frame++) {
      state = corridor.step(state, asking({ advance: 1 }), 1 / 60)
    }

    expect(Math.abs(state.stroll.position.x)).toBeLessThanOrEqual(ROOM.alongString)
    expect(Math.abs(state.stroll.position.z)).toBeLessThanOrEqual(ROOM.acrossString)
  })

  test('walking into a wall at an angle slides along it', () => {
    // Being stuck square-on to a wall is how a room stops feeling like a room.
    let state = corridor.step(corridor.initial(), asking({ yaw: 0.6 }), 1 / 60)
    const before = state.stroll.position.clone()
    for (let frame = 0; frame < 600; frame++) {
      state = corridor.step(state, asking({ advance: 1 }), 1 / 60)
    }

    expect(state.stroll.position.distanceTo(before)).toBeGreaterThan(1)
  })

  test('a turn moves the view and not the feet', () => {
    const turned = corridor.step(corridor.initial(), asking({ yaw: 0.8 }), 1 / 60)
    expect(turned.stroll.position.distanceTo(corridor.initial().stroll.position)).toBeCloseTo(0, 12)
  })

  test('it never modifies the state it was given', () => {
    const state = corridor.initial()
    const before = state.stroll.position.clone()
    corridor.step(state, asking({ advance: 1, strafe: 1 }), 1)

    expect(state.stroll.position.distanceTo(before)).toBe(0)
  })
})

describe('turning the same way as every other space', () => {
  test('a positive yaw turns the viewer to their right', () => {
    const here = corridor.initial()
    const turned = corridor.step(here, asking({ yaw: 0.3 }), 1 / 60)

    expect(facingOf(turned.stroll).dot(rightOf(here.stroll))).toBeGreaterThan(0)
  })

  test('it agrees with the shell, which is what a shared vocabulary is for', () => {
    // The hooks these replace disagreed: the same drag turned the viewer left
    // in the sphere and right in the corridor. Asserted against the sphere
    // rather than restated, so the two cannot drift apart again.
    const shell = shellDomain(9, 1.65)
    const standing = shell.initial()
    const spun = shell.step(standing, asking({ yaw: 0.3 }), 1 / 60)
    const shellRight = new Vector3().crossVectors(facingAt(standing.stance), upAt(standing.stance))

    const shellWentRight = facingAt(spun.stance).dot(shellRight) > 0

    const here = corridor.initial()
    const corridorWentRight =
      facingOf(corridor.step(here, asking({ yaw: 0.3 }), 1 / 60).stroll).dot(rightOf(here.stroll)) >
      0

    expect(corridorWentRight).toBe(shellWentRight)
  })
})

describe('the pose it hands the rig', () => {
  test('faces the way the viewer is turned', () => {
    const state = corridor.step(corridor.initial(), asking({ yaw: 0.5 }), 1 / 60)
    const forward = new Vector3(0, 0, -1).applyQuaternion(corridor.poseOf(state).orientation)

    expect(forward.distanceTo(facingOf(state.stroll))).toBeCloseTo(0, 6)
  })

  test('keeps its head on world up, because the floor is flat', () => {
    const state = corridor.step(corridor.initial(), asking({ yaw: 2.2 }), 1 / 60)
    const up = new Vector3(0, 1, 0).applyQuaternion(corridor.poseOf(state).orientation)

    expect(up.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(0, 6)
  })
})

describe('what it needs to be usable', () => {
  test('it needs to walk and to turn', () => {
    expect(corridor.needs).toContain('advance')
    expect(corridor.needs).toContain('yaw')
  })

  test('it does not need to strafe', () => {
    expect(corridor.needs).not.toContain('strafe')
  })
})
