/**
 * How far a press may wander and still count as held rather than dragged.
 *
 * A finger never lands and holds on exactly one pixel, so a still press needs
 * tolerance; a drag must not be mistaken for one at any cost, because that
 * would start walking the viewer while they are looking at something.
 */
export const SLOP_PX = 10

/**
 * How long a press must be held still before it starts walking.
 *
 * Long enough that an ordinary tap finishes first — a tap has to be able to
 * act without the viewer taking a step on the way.
 */
export const DWELL_MS = 220

/** What the pointer did. `tick` is the frame passing with nothing happening. */
export type Press =
  | { kind: 'down'; x: number; y: number; at: number }
  | { kind: 'move'; x: number; y: number; at: number }
  | { kind: 'tick'; at: number }
  | { kind: 'up'; at: number }
  | { kind: 'cancel'; at: number }

/** What this press has turned out to be, once it is no longer in doubt. */
type Role = 'undecided' | 'look' | 'advance'

export type GestureState = {
  /** Where and when the press landed, or null between presses. */
  origin: { x: number; y: number; at: number } | null
  /** Where it was last seen, for measuring a frame's travel. */
  last: { x: number; y: number } | null
  role: Role
}

export type GestureOut = {
  state: GestureState
  /** Pixels travelled since the last sample. Zero unless this press is looking. */
  dragged: { dx: number; dy: number }
  /** True on every frame the press is walking the viewer. */
  advancing: boolean
  /** True on the one frame a press ended as a tap. */
  acted: boolean
}

const STILL = { dx: 0, dy: 0 } as const

export function idleGesture(): GestureState {
  return { origin: null, last: null, role: 'undecided' }
}

function out(state: GestureState, extra: Partial<Omit<GestureOut, 'state'>> = {}): GestureOut {
  return { state, dragged: STILL, advancing: false, acted: false, ...extra }
}

/**
 * The gesture after one pointer event or one frame.
 *
 * Three gestures on one pointer, told apart by travel and by time: past the
 * slop it is looking, held still past the dwell it is walking, and over before
 * either it was a tap. A phone has no second button to say this with.
 *
 * Once a press has become a look it stays one, even if the finger then holds
 * still — a slow drag that pauses is still a drag.
 */
export function onPress(state: GestureState, press: Press): GestureOut {
  switch (press.kind) {
    case 'down':
      return out({
        origin: { x: press.x, y: press.y, at: press.at },
        last: { x: press.x, y: press.y },
        role: 'undecided',
      })

    case 'up':
      // A tap is a press that never became anything else.
      return out(idleGesture(), { acted: state.role === 'undecided' && state.origin !== null })

    case 'cancel':
      return out(idleGesture())

    case 'move': {
      if (!state.origin || !state.last) return out(state)

      // Travelling past the slop makes this a look, whatever it had become —
      // including a walk. The two promotions are a race: a drag slower than
      // the slop per dwell crosses the time threshold before the distance one,
      // so a careful drag would otherwise be caught as a walk and, with no way
      // back out, would never turn the viewer at all. That is not a corner
      // case; it is what looking slowly around a room feels like.
      const role =
        state.role !== 'look' &&
        Math.hypot(press.x - state.origin.x, press.y - state.origin.y) > SLOP_PX
          ? 'look'
          : state.role

      const moved: GestureState = {
        origin: state.origin,
        last: { x: press.x, y: press.y },
        role,
      }

      if (role !== 'look') return out(moved)
      return out(moved, {
        dragged: { dx: press.x - state.last.x, dy: press.y - state.last.y },
      })
    }

    case 'tick': {
      if (!state.origin) return out(state)

      if (state.role === 'undecided' && press.at - state.origin.at > DWELL_MS) {
        return out({ ...state, role: 'advance' }, { advancing: true })
      }
      return out(state, { advancing: state.role === 'advance' })
    }
  }
}
