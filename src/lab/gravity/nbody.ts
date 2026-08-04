import { Vector3 } from 'three'

export type Body = {
  position: Vector3
  velocity: Vector3
  mass: number
  radius: number
}

export type NBodyOptions = {
  /** Gravitational constant, scaled for a room-sized box rather than a solar system. */
  strength: number
  /** Half-extent of the cube the bodies are confined to. */
  bounds: number
  /** Fraction of speed kept when a body bounces off a wall. */
  restitution: number
  /**
   * Added to the separation before the inverse square is taken.
   *
   * Without it, two bodies passing close swap a near-infinite impulse in a
   * single step and one of them leaves the room at implausible speed. This is
   * the standard Plummer softening and it is what keeps the simulation stable
   * at any frame rate rather than only at the ones that happened to be tested.
   */
  softening: number
}

/**
 * Longest step the integrator will take, in seconds.
 *
 * A backgrounded tab resumes with a delta of whole seconds. Explicit Euler
 * over a step that long is not inaccurate, it is divergent: bodies gain energy
 * from nothing and the whole system detonates. Better to run slow for a frame.
 */
export const MAX_STEP = 1 / 30

/**
 * Advances an n-body system by one step, in place.
 *
 * Semi-implicit Euler — velocity first, then position with the *new* velocity.
 * It costs the same as explicit Euler and does not pump energy into orbits,
 * which explicit Euler does visibly within a few seconds.
 */
export function step(bodies: Body[], delta: number, options: NBodyOptions): void {
  const dt = Math.min(Math.max(delta, 0), MAX_STEP)
  if (dt === 0) return

  applyGravity(bodies, dt, options)

  for (const body of bodies) {
    body.position.addScaledVector(body.velocity, dt)
  }

  resolveContacts(bodies)
  for (const body of bodies) confine(body, options)
}

function applyGravity(bodies: Body[], dt: number, { strength, softening }: NBodyOptions): void {
  const between = new Vector3()

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]

      between.subVectors(b.position, a.position)
      const separation = between.length()
      if (separation === 0) continue

      const softened = separation + softening
      const scale = (strength * dt) / (softened * softened * separation)

      // Equal and opposite, so momentum is conserved by construction rather
      // than by both halves happening to agree.
      a.velocity.addScaledVector(between, scale * b.mass)
      b.velocity.addScaledVector(between, -scale * a.mass)
    }
  }
}

/** Elastic collision between two spheres, plus the separation to stop overlap. */
function resolveContacts(bodies: Body[]): void {
  const normal = new Vector3()

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]

      normal.subVectors(b.position, a.position)
      const separation = normal.length()
      const touching = a.radius + b.radius
      if (separation === 0 || separation >= touching) continue

      normal.divideScalar(separation)

      // Push apart in proportion to mass, so a heavy body barely moves.
      const overlap = touching - separation
      const total = a.mass + b.mass
      a.position.addScaledVector(normal, (-overlap * b.mass) / total)
      b.position.addScaledVector(normal, (overlap * a.mass) / total)

      const approach = normal.dot(b.velocity) - normal.dot(a.velocity)
      if (approach >= 0) continue // already separating; an impulse would stick them together

      const impulse = (-2 * approach) / total
      a.velocity.addScaledVector(normal, -impulse * b.mass)
      b.velocity.addScaledVector(normal, impulse * a.mass)
    }
  }
}

/** Keeps a body inside the box, whatever the simulation tried to do to it. */
function confine(body: Body, { bounds, restitution }: NBodyOptions): void {
  const limit = bounds - body.radius

  for (const axis of ['x', 'y', 'z'] as const) {
    if (body.position[axis] > limit) {
      body.position[axis] = limit
      if (body.velocity[axis] > 0) body.velocity[axis] *= -restitution
    } else if (body.position[axis] < -limit) {
      body.position[axis] = -limit
      if (body.velocity[axis] < 0) body.velocity[axis] *= -restitution
    }
  }
}
