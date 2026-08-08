/**
 * What a visitor is asking for this frame, whatever they asked with.
 *
 * The whole vocabulary, deliberately small: a field added here is one that
 * every future domain is obliged to answer, so widening this is cheap and
 * shrinking it is not.
 */
export type IntentField = 'advance' | 'strafe' | 'yaw' | 'pitch' | 'act' | 'leave'

/**
 * A demand with a magnitude, not an event.
 *
 * Continuous domains integrate these over the frame; discrete ones latch or
 * threshold them. That is what lets a sphere, a corridor, a graph and a
 * carousel share one vocabulary.
 *
 * Movement is normalised and orientation is absolute, and the asymmetry is
 * meant: a step is radians of arc on a shell and metres of floor in a
 * corridor, so its scale belongs to the domain — while a turn is radians
 * everywhere. It is also what lets a held key and a drag sum on one axis.
 */
export type Intents = {
  /** Along the way the viewer faces, −1..1. Scaled by the domain's own pace. */
  advance: number
  /** Across it, −1..1. Scaled by the domain's own pace. */
  strafe: number
  /** Radians turned on the spot, positive to the right. */
  yaw: number
  /** Radians the head tilts back, positive upwards. */
  pitch: number
  /** Act on whatever is in front of the viewer. */
  act: boolean
  /** Leave the space entirely. */
  leave: boolean
}

export const NO_INTENTS: Intents = {
  advance: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  act: false,
  leave: false,
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

/**
 * Everything the active techniques asked for, as one demand.
 *
 * Techniques compose rather than take turns: keys, a pointer and a rope may
 * all be live, and whichever the visitor reaches for wins without a mode to
 * switch. Three of them asking to go forward is still forward, which is why
 * the normalised fields clamp after summing and the angles do not.
 */
export function sumIntents(parts: readonly Intents[]): Intents {
  let advance = 0
  let strafe = 0
  let yaw = 0
  let pitch = 0
  let act = false
  let leave = false

  for (const part of parts) {
    advance += part.advance
    strafe += part.strafe
    yaw += part.yaw
    pitch += part.pitch
    act ||= part.act
    leave ||= part.leave
  }

  return { advance: clampUnit(advance), strafe: clampUnit(strafe), yaw, pitch, act, leave }
}
