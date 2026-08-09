import { describe, expect, test } from 'vitest'
import {
  DWELL_MS,
  idleGesture,
  onPress,
  SLOP_PX,
  type GestureState,
  type Press,
} from '../../../src/space/gesture'

/** Feeds a whole press to the machine and hands back every frame's output. */
function play(presses: readonly Press[]) {
  let state: GestureState = idleGesture()
  return presses.map((press) => {
    const out = onPress(state, press)
    state = out.state
    return out
  })
}

describe('a press that travels', () => {
  test('is looking, and reports how far it moved since last time', () => {
    const [, moved] = play([
      { kind: 'down', x: 100, y: 100, at: 0 },
      { kind: 'move', x: 100 + SLOP_PX + 5, y: 130, at: 50 },
    ])

    expect(moved.dragged.dx).toBe(SLOP_PX + 5)
    expect(moved.dragged.dy).toBe(30)
    expect(moved.advancing).toBe(false)
  })

  test('stays looking even if it then holds still', () => {
    // A slow drag that pauses is still a drag. Promoting it to a walk would
    // start moving the viewer in the middle of them looking at something.
    const frames = play([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: 60, y: 0, at: 40 },
      { kind: 'tick', at: 40 + DWELL_MS * 3 },
    ])

    expect(frames.at(-1)!.advancing).toBe(false)
  })

  test('does not act when it ends', () => {
    const frames = play([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'move', x: 90, y: 0, at: 30 },
      { kind: 'up', at: 60 },
    ])

    expect(frames.at(-1)!.acted).toBe(false)
  })
})

describe('a press that stays put', () => {
  test('starts walking once it has been held past the dwell', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS - 1 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(frames[1].advancing).toBe(false)
    expect(frames[2].advancing).toBe(true)
  })

  test('keeps walking until it is released', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
      { kind: 'tick', at: DWELL_MS + 400 },
      { kind: 'up', at: DWELL_MS + 500 },
      { kind: 'tick', at: DWELL_MS + 600 },
    ])

    expect(frames[2].advancing).toBe(true)
    expect(frames.at(-1)!.advancing).toBe(false)
  })

  test('tolerates a finger that wobbles inside the slop', () => {
    // A finger never lands and holds on exactly one pixel.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'move', x: 10 + SLOP_PX - 1, y: 10, at: 20 },
      { kind: 'tick', at: DWELL_MS + 1 },
    ])

    expect(frames.at(-1)!.advancing).toBe(true)
    expect(frames[1].dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('a drag that starts after the dwell takes over from the walk', () => {
    // The two promotions are a race, and time can win it: a drag slower than
    // the slop per dwell is a walk by the time it has travelled far enough to
    // be a look. Without this the press stays a walk for good and the viewer
    // can never turn — which is exactly what looking slowly around a room
    // does, so it is not a corner case.
    const frames = play([
      { kind: 'down', x: 0, y: 0, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
      { kind: 'move', x: SLOP_PX + 30, y: 0, at: DWELL_MS + 40 },
      { kind: 'tick', at: DWELL_MS + 60 },
    ])

    expect(frames[1].advancing, 'it should have started walking').toBe(true)
    expect(frames[2].dragged.dx, 'the drag should be looking').toBe(SLOP_PX + 30)
    expect(frames[3].advancing, 'it should have stopped walking').toBe(false)
  })

  test('does not act when it is finally released', () => {
    // It walked. A walk that also opens something on release would mean you
    // cannot cross a room without pressing whatever you stopped in front of.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'tick', at: DWELL_MS + 1 },
      { kind: 'up', at: DWELL_MS + 200 },
    ])

    expect(frames.at(-1)!.acted).toBe(false)
  })
})

describe('a press that is over quickly', () => {
  test('acts, once, on release', () => {
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'up', at: DWELL_MS - 30 },
      { kind: 'tick', at: DWELL_MS + 200 },
    ])

    expect(frames[1].acted).toBe(true)
    expect(frames[2].acted).toBe(false)
  })

  test('a cancelled press acts on nothing', () => {
    // Pointer capture lost, a call arriving, a gesture the browser took over.
    const frames = play([
      { kind: 'down', x: 10, y: 10, at: 0 },
      { kind: 'cancel', at: 40 },
    ])

    expect(frames[1].acted).toBe(false)
    expect(frames[1].advancing).toBe(false)
  })
})

describe('the machine itself', () => {
  test('reports nothing at all when no press is in progress', () => {
    const out = onPress(idleGesture(), { kind: 'tick', at: 5000 })

    expect(out.advancing).toBe(false)
    expect(out.acted).toBe(false)
    expect(out.dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('ignores a move that arrives with no press behind it', () => {
    // A mouse crossing the window with no button down is not a drag.
    const out = onPress(idleGesture(), { kind: 'move', x: 500, y: 500, at: 10 })
    expect(out.dragged).toEqual({ dx: 0, dy: 0 })
  })

  test('does not modify the state it was given', () => {
    const state = idleGesture()
    onPress(state, { kind: 'down', x: 1, y: 2, at: 0 })
    expect(state.origin).toBeNull()
  })
})
