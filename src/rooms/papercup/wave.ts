/**
 * How fast a pulse runs down the string, in units a second.
 *
 * Slow enough to watch travel — the whole point of the room is that you can see
 * the thing crossing the space rather than arriving instantly — and fast enough
 * that a reply does not feel like a fault.
 */
export const SPEED = 7.5

/**
 * How long a packet is.
 *
 * Compact support, not a tail that reaches forever: a pulse that has not got
 * here yet must leave this stretch of string exactly still, or the whole
 * illusion of something travelling collapses into the string just breathing.
 */
export const WIDTH = 1.15

/** How far the string is pulled aside at the centre of a packet. */
export const AMPLITUDE = 0.26

/**
 * Something sent down the string: when it left, and which way it is going.
 *
 * `direction` is +1 for a pulse running towards +x and −1 for one coming back.
 * A pulse carries no content, because the room is not about what was said — it
 * is about the fact that saying it is a thing that crosses a distance.
 */
export type Pulse = {
  firedAt: number
  direction: 1 | -1
}

/** Where the middle of `pulse` has got to along a string of length `span`. */
export function headAt(pulse: Pulse, now: number, span: number): number {
  const travelled = SPEED * Math.max(0, now - pulse.firedAt)
  const start = (-pulse.direction * span) / 2
  return start + pulse.direction * travelled
}

/** Whether `pulse` has reached the far cup and is no longer on the string. */
export function hasArrived(pulse: Pulse, now: number, span: number): boolean {
  return Math.abs(headAt(pulse, now, span)) > span / 2
}

/** How long a pulse takes to cross a string of length `span`. */
export function crossingTime(span: number): number {
  return span / SPEED
}

/**
 * The shape of a single packet, from how far along it you are.
 *
 * A raised cosine rather than a bell curve, because it reaches exactly zero at
 * its own edges instead of merely getting small. That is what lets the rest of
 * the string be honestly still, and it also means the string does not step when
 * a packet's edge passes — the curve leaves zero with zero slope.
 */
export function envelopeAt(offset: number): number {
  if (Math.abs(offset) >= 1) return 0
  return Math.cos((offset * Math.PI) / 2) ** 2
}

/**
 * How far the string is pulled aside at `x`, with `pulses` in flight.
 *
 * Pulses add. Two passing through each other pile up where they meet and come
 * out the other side unchanged, which is what waves on a string actually do and
 * costs nothing to get right.
 */
export function displacementAt(x: number, pulses: Pulse[], now: number, span: number): number {
  let total = 0
  for (const pulse of pulses) {
    if (hasArrived(pulse, now, span)) continue
    total += AMPLITUDE * envelopeAt((x - headAt(pulse, now, span)) / WIDTH)
  }
  return total
}

/** The pulses of `pulses` still on the string. */
export function stillTravelling(pulses: Pulse[], now: number, span: number): Pulse[] {
  return pulses.filter((pulse) => !hasArrived(pulse, now, span))
}
