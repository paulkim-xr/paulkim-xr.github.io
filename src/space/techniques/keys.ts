import { NO_INTENTS, type Intents } from '../intents'
import type { Signals, Technique } from '../technique'

/** Radians turned or tilted per second while a look key is held. */
export const LOOK_PER_SECOND = 1.1

/** Whether any of `names` is down. */
function anyOf(keys: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => keys.has(name))
}

/** +1, −1 or 0, from which side is held. */
function axis(
  keys: ReadonlySet<string>,
  positive: readonly string[],
  negative: readonly string[],
): number {
  return (anyOf(keys, positive) ? 1 : 0) - (anyOf(keys, negative) ? 1 : 0)
}

/**
 * The bindings a first-person walker has always had.
 *
 * Arrows and WASD to go and to turn, page up and down for the head, space to
 * act and escape to leave — so a room's one indispensable move is reachable
 * without a mouse.
 *
 * Movement comes out normalised and turning comes out in radians: a step means
 * something different in every space and the domain scales it, while a turn
 * means radians everywhere.
 */
export const keysTechnique: Technique<null> = {
  id: 'keys',
  produces: ['advance', 'strafe', 'yaw', 'pitch', 'act', 'leave'],
  requires: ['keys'],

  initial: () => null,

  reduce(state: null, signals: Signals, seconds: number) {
    if (signals.keys.size === 0) return { state, intents: NO_INTENTS }

    // Lower-cased because `event.key` for a letter is the letter typed, so the
    // same physical key arrives as `w` or `W` depending on shift and caps lock.
    const keys = new Set([...signals.keys].map((key) => key.toLowerCase()))
    const turning = LOOK_PER_SECOND * seconds

    const intents: Intents = {
      advance: axis(keys, ['arrowup', 'w'], ['arrowdown', 's']),
      strafe: axis(keys, ['d'], ['a']),
      yaw: axis(keys, ['arrowright'], ['arrowleft']) * turning,
      pitch: axis(keys, ['pageup'], ['pagedown']) * turning,
      act: anyOf(keys, [' ', 'enter']),
      leave: keys.has('escape'),
    }

    return { state, intents }
  },
}
