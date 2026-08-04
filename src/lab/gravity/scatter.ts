import { Vector3 } from 'three'
import type { Body } from './nbody'

export type ScatterOptions = {
  /** Below this radius of gyration the system counts as collapsed. */
  clumped: number
  /** Seconds it must stay collapsed before the burst fires. */
  patience: number
  /** Speed the burst adds, before the tangential share is taken out. */
  strength: number
  /** How much of the burst goes sideways rather than straight out. */
  swirl: number
  /**
   * How much of the burst aims back at the middle of the box.
   *
   * Only mutual attraction acts here, so the centre of mass drifts wherever
   * the last wall bounce sent it and the cloud ends up parked in a corner,
   * losing a little more energy to the floor on every bounce. Without this the
   * burst faithfully explodes a heap that is still in the corner.
   */
  recentre: number
}

export type ClutterWatch = {
  /** Seconds spent collapsed so far. */
  held: number
  /** How many bursts have fired, so each can differ from the last. */
  bursts: number
}

export const idleWatch: ClutterWatch = { held: 0, bursts: 0 }

/** Centre of mass. */
export function centreOfMass(bodies: Body[], into = new Vector3()): Vector3 {
  into.set(0, 0, 0)
  const total = bodies.reduce((sum, body) => sum + body.mass, 0)
  if (total === 0) return into

  for (const body of bodies) into.addScaledVector(body.position, body.mass)
  return into.divideScalar(total)
}

/**
 * RMS distance of the bodies from their centre of mass.
 *
 * The one number that says whether this is a system or a pile. Mean distance
 * would do almost as well, but squaring keeps a single escapee from
 * disguising the fact that the other eight have collapsed.
 */
export function radiusOfGyration(bodies: Body[]): number {
  if (bodies.length === 0) return 0

  const centre = centreOfMass(bodies)
  const spread = bodies.reduce(
    (sum, body) => sum + body.position.distanceToSquared(centre),
    0,
  )

  return Math.sqrt(spread / bodies.length)
}

/**
 * Blows the system apart from its own centre of mass.
 *
 * Not purely radial: a straight outward push sends every body on a line
 * through the centre, so they fall back into exactly the pile they came from
 * and the whole thing becomes a metronome. The swirl term puts them on curved
 * paths instead, and the axis it turns about changes with each burst so no two
 * are the same without needing a random number.
 */
export function scatter(bodies: Body[], options: ScatterOptions, burstIndex: number): void {
  const centre = centreOfMass(bodies)
  const outward = new Vector3()
  const sideways = new Vector3()

  // The drift is what carried the system into a wall, and an explosion that
  // kept it would put the pieces back there.
  cancelDrift(bodies)

  const homeward = centre.clone().negate()
  if (homeward.lengthSq() > 1e-8) homeward.normalize()
  else homeward.set(0, 0, 0)

  // Walks the sphere rather than repeating, so successive bursts throw the
  // cloud along different axes while staying reproducible.
  const axis = spiralDirection(burstIndex)

  bodies.forEach((body, index) => {
    outward.subVectors(body.position, centre)
    // A body sitting exactly on the centre of mass has no outward direction.
    // It needs one of its own rather than the shared axis: give every such
    // body the same push and cancelling the drift below erases all of it.
    if (outward.lengthSq() === 0) outward.copy(spiralDirection(burstIndex + index + 1))
    outward.normalize()

    sideways.crossVectors(axis, outward)
    // Parallel to the axis: no sideways direction exists, so radial will do.
    if (sideways.lengthSq() < 1e-6) sideways.set(0, 0, 0)
    else sideways.normalize()

    body.velocity
      .addScaledVector(outward, options.strength * (1 - options.swirl))
      .addScaledVector(sideways, options.strength * options.swirl)
  })

  // The outward directions are unit vectors from the centre of mass, and for
  // any pile that is not perfectly symmetric they do not cancel — so the
  // explosion itself shoves the cloud somewhere, which is how it ends up
  // against a wall in the first place. Neutralise that, then add the only
  // motion that is meant to be there.
  cancelDrift(bodies)
  for (const body of bodies) {
    body.velocity.addScaledVector(homeward, options.strength * options.recentre)
  }
}

/** A different unit direction for every whole number, without a random source. */
function spiralDirection(seed: number): Vector3 {
  const golden = Math.PI * (1 + Math.sqrt(5))
  return new Vector3(
    Math.cos(golden * seed),
    Math.sin(golden * seed * 0.7),
    Math.sin(golden * seed),
  ).normalize()
}

/** Removes the whole system's shared motion, leaving only motion within it. */
function cancelDrift(bodies: Body[]): void {
  const totalMass = bodies.reduce((sum, one) => sum + one.mass, 0)
  if (totalMass === 0) return

  const drift = new Vector3()
  for (const one of bodies) drift.addScaledVector(one.velocity, one.mass)
  drift.divideScalar(totalMass)

  for (const one of bodies) one.velocity.sub(drift)
}

/**
 * Watches for collapse and reports when the system needs breaking up.
 *
 * Pure: takes the watch state and returns the next one, so the decision can be
 * tested without a renderer, a clock or nine spheres.
 */
export function watchClutter(
  watch: ClutterWatch,
  bodies: Body[],
  delta: number,
  options: ScatterOptions,
): { watch: ClutterWatch; burst: boolean } {
  if (radiusOfGyration(bodies) >= options.clumped) {
    return { watch: { ...watch, held: 0 }, burst: false }
  }

  const held = watch.held + Math.max(0, delta)
  if (held < options.patience) return { watch: { ...watch, held }, burst: false }

  return { watch: { held: 0, bursts: watch.bursts + 1 }, burst: true }
}
