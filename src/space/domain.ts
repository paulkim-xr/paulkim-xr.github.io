import type { IntentField, Intents } from './intents'
import type { Pose } from './pose'

/**
 * A space, and the rule for traversing it.
 *
 * `State` is opaque on purpose, and that is what admits spaces which are not
 * Euclidean: an atlas of charts for a portal space, an isometry for a
 * hyperbolic one, an index for a cycle.
 *
 * Motion is a transformation composed onto a state, never a delta added to a
 * position. For a Euclidean room the transformation is a translation, so
 * nothing is lost today — but a `Vector3` and addition would have excluded
 * hyperbolic, spherical, Sol and portal spaces outright rather than stylishly.
 */
export interface Domain<State> {
  initial(): State
  /**
   * The state `seconds` later, given what was asked for.
   *
   * `intents.advance` and `intents.strafe` arrive normalised: the domain owns
   * its own pace, because a step is radians of arc on a shell and metres of
   * floor in a corridor. `yaw` and `pitch` arrive as radians and are applied
   * as they are.
   */
  step(state: State, intents: Intents, seconds: number): State
  /** Fields without which this space cannot be used at all. */
  needs: readonly IntentField[]
}

/**
 * A domain that also puts a body somewhere: one you move *through*.
 *
 * The hub is the domain that is not this. A transformation changes the world
 * while the viewer holds still, so it has no pose to give and mounts no rig —
 * it takes only its input from this design.
 */
export interface Embodied<State> extends Domain<State> {
  poseOf(state: State): Pose
  /** Head tilt in radians. Applied by the rig flat, dropped in XR. */
  pitchOf(state: State): number
}
