import { Vector3 } from 'three'

/**
 * How far the viewer can get from the middle of the room, in each direction.
 *
 * Not a preference. The room is a closed box because the project is: papercup
 * runs on your own hardware and no audio leaves your network, so the space it
 * gets is one you cannot walk out of. Both ends are sealed by the cups, and the
 * string is knotted through them.
 */
export type Bounds = {
  /** Along the string. */
  alongString: number
  /** Across it. */
  acrossString: number
}

/**
 * Where the viewer is standing on the floor, and which way they are turned.
 *
 * A heading rather than a full orientation: the floor here is flat and level,
 * so a viewer has one angle to turn through and no way to end up tipped over.
 * That is the whole difference from the sphere next door, where up is different
 * at every point and an angle would not have been enough.
 */
export type Stroll = {
  position: Vector3
  /** Radians clockwise from facing down the string towards +x. */
  heading: number
}

/** Where the room opens: at the middle, looking along the string. */
export function initialStroll(): Stroll {
  return { position: new Vector3(0, 0, 0), heading: 0 }
}

/** Which way the viewer is facing, along the floor. */
export function facingOf(stroll: Stroll): Vector3 {
  return new Vector3(Math.cos(stroll.heading), 0, Math.sin(stroll.heading))
}

/** Their right hand, along the floor. */
export function rightOf(stroll: Stroll): Vector3 {
  return new Vector3(-Math.sin(stroll.heading), 0, Math.cos(stroll.heading))
}

/** A move across the floor, in units, plus a turn in radians. */
export type Step = {
  forward: number
  sideways: number
  turned: number
}

/**
 * Where `step` takes the viewer, kept inside `bounds`.
 *
 * Clamped per axis rather than refused outright, so walking into a wall at an
 * angle slides along it instead of stopping dead — being stuck square-on to a
 * wall you cannot see the edge of is how a room stops feeling like a room.
 */
export function strollTo(stroll: Stroll, step: Step, bounds: Bounds): Stroll {
  const position = stroll.position
    .clone()
    .addScaledVector(facingOf(stroll), step.forward)
    .addScaledVector(rightOf(stroll), step.sideways)

  position.x = clamp(position.x, bounds.alongString)
  position.z = clamp(position.z, bounds.acrossString)

  return { position, heading: stroll.heading + step.turned }
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value))
}
