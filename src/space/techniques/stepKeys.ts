import { NO_INTENTS, type Intents } from '../intents'
import type { Signals, Technique } from '../technique'

/**
 * How far one press of an arrow key turns a list.
 *
 * One step's worth, because on a list that is what an arrow key means. This is
 * the difference between a ring and a room: in a room an arrow is a rate, and
 * you hold it to keep turning; on a list it is a discrete "next", and tapping
 * it has to move you by one thing or the key is useless.
 *
 * Stated here rather than imported from the ring it usually drives. A
 * technique that read the domain's own threshold would agree with it by
 * construction and could never be caught disagreeing — break the domain and
 * the technique would break identically, and every test would still pass. The
 * two are held together by a test that puts one through the other instead.
 */
const STEP_PER_PRESS = 0.35

/**
 * How fast a held arrow key keeps going, in steps a second.
 *
 * Slow enough to read. The browser repeats `keydown` while a key is held, but
 * the signal layer filters those out so an edge cannot fire on a repeat —
 * which leaves a held key doing nothing at all unless it also asks for a rate.
 */
const STEPS_PER_SECOND = 2

const RIGHT = ['arrowright', 'd']
const LEFT = ['arrowleft', 'a']
const ACT = ['enter', ' ']

function anyOf(keys: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => keys.has(name))
}

function axis(
  keys: ReadonlySet<string>,
  positive: readonly string[],
  negative: readonly string[],
): number {
  return (anyOf(keys, positive) ? 1 : 0) - (anyOf(keys, negative) ? 1 : 0)
}

/**
 * The keyboard, for a ring of things rather than a space.
 *
 * A room's keys emit a rate: hold one and you keep turning. A list's emit a
 * step: tap one and you move by exactly one thing. Both arrive as radians of
 * yaw and both go through the same domain — what differs is only what a
 * keystroke is *worth*, which is a fact about lists and not about any
 * particular hub.
 *
 * That a space can bring its own technique rather than bend to the shipped
 * one is the point of the technique list. This is the second example, after
 * the pointer that knows it has nowhere to walk.
 */
export const stepKeysTechnique: Technique<null> = {
  id: 'step-keys',
  produces: ['yaw', 'act'],
  requires: ['keys'],

  initial: () => null,

  reduce(state: null, signals: Signals, seconds: number) {
    if (signals.keys.size === 0 && signals.struck.size === 0) {
      return { state, intents: NO_INTENTS }
    }

    const struck = new Set([...signals.struck].map((key) => key.toLowerCase()))
    const held = new Set([...[...signals.keys].map((key) => key.toLowerCase()), ...struck])

    const intents: Intents = {
      ...NO_INTENTS,
      // A press is worth a step; keeping it down keeps going, at a pace slow
      // enough to see what is passing.
      yaw:
        axis(struck, RIGHT, LEFT) * STEP_PER_PRESS +
        axis(held, RIGHT, LEFT) * STEP_PER_PRESS * STEPS_PER_SECOND * seconds,
      act: anyOf(struck, ACT),
    }

    return { state, intents }
  },
}
