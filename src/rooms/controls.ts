/** Radians of look per pixel of drag. Most of a right angle across a phone. */
export const LOOK_PER_PIXEL = 0.0032
/** Radians of arc walked per second while a walk key is held. */
export const ARC_PER_SECOND = 0.85
/** Radians turned or tilted per second while a look key is held. */
export const LOOK_PER_SECOND = 1.1

/**
 * Everything a frame of input asks the viewer to do.
 *
 * Walking and turning and tilting kept apart, because they are applied to
 * different things: the first two move the stance, the third moves only the
 * head.
 */
export type Motion = {
  /** Arc along the way they are facing. */
  forward: number
  /** Arc across it. */
  sideways: number
  /** Radians turned on the spot, positive to the right. */
  turned: number
  /** Radians the head tilts back, positive upwards. */
  tilted: number
}

const NONE: Motion = { forward: 0, sideways: 0, turned: 0, tilted: 0 }

/** Whether any of `names` is currently down. */
function anyOf(held: ReadonlySet<string>, names: string[]): boolean {
  return names.some((name) => held.has(name))
}

/** How much of `rate` a frame of `seconds` is worth, given what is held. */
function axis(
  held: ReadonlySet<string>,
  seconds: number,
  rate: number,
  positive: string[],
  negative: string[],
): number {
  const amount = rate * seconds
  return (anyOf(held, positive) ? amount : 0) - (anyOf(held, negative) ? amount : 0)
}

/**
 * How fast a particular room moves its viewer.
 *
 * A room sets its own pace because the rooms are not the same shape. Walking
 * the inside of a sphere is measured in radians of arc, walking a corridor in
 * metres along the floor, and one number cannot be both — 0.85 is a comfortable
 * stroll on a shell of radius nine and a sprint down a room eighteen long.
 */
export type Rates = {
  /** Walking and stepping across. */
  move: number
  /** Turning and tilting. */
  look: number
}

export const DEFAULT_RATES: Rates = { move: ARC_PER_SECOND, look: LOOK_PER_SECOND }

/**
 * What the keys held down come to over a frame of `seconds`.
 *
 * Keys are matched lower-cased, because `event.key` for a letter is the letter
 * that was typed — so the same physical key arrives as `w` or `W` depending on
 * whether shift or caps lock happens to be down, and a walk that stops when you
 * hold shift is a bug nobody thinks to look for.
 *
 * The bindings are the ones a first-person walker has always had: the arrows
 * and WASD to go and to turn, and page up and down for the head, so the room's
 * one indispensable move — looking up — is reachable without a mouse.
 */
export function motionFrom(
  held: ReadonlySet<string>,
  seconds: number,
  rates: Rates = DEFAULT_RATES,
): Motion {
  if (held.size === 0) return NONE

  return {
    forward: axis(held, seconds, rates.move, ['arrowup', 'w'], ['arrowdown', 's']),
    sideways: axis(held, seconds, rates.move, ['d'], ['a']),
    turned: axis(held, seconds, rates.look, ['arrowright'], ['arrowleft']),
    tilted: axis(held, seconds, rates.look, ['pageup'], ['pagedown']),
  }
}

/**
 * What a drag of `dx` by `dy` pixels comes to.
 *
 * Drag pulls the room past the viewer rather than swinging their head: dragging
 * left brings what was on the right round to the front, and dragging down
 * brings the ceiling — and the object hanging under it — down into view. The
 * same way round as dragging a panorama, and the reason "look up" is something
 * a visitor discovers rather than has to be told.
 */
export function lookFrom(dx: number, dy: number): { turned: number; tilted: number } {
  return { turned: -dx * LOOK_PER_PIXEL, tilted: dy * LOOK_PER_PIXEL }
}
