import { describe, expect, test } from 'vitest'
import {
  initialState,
  isLocked,
  reduce,
  shouldMountScene,
  type TransitionEvent,
  type TransitionState,
} from '../../../src/transition/machine'

const run = (state: TransitionState, ...events: TransitionEvent[]): TransitionState =>
  events.reduce(reduce, state)

describe('entering a room', () => {
  test('starts in browsing with nothing targeted', () => {
    expect(initialState.phase).toBe('browsing')
    expect(initialState.target).toBeNull()
  })

  test('SELECT begins focusing on the chosen room', () => {
    const state = reduce(initialState, { type: 'SELECT', id: 'papercup' })
    expect(state.phase).toBe('focusing')
    expect(state.target).toBe('papercup')
    expect(state.direction).toBe('in')
  })

  test('runs the full sequence to inRoom', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
      { type: 'SCENE_READY' },
      { type: 'REVEAL_COMPLETE' },
    )
    expect(state.phase).toBe('inRoom')
    expect(state.target).toBe('papercup')
  })
})

describe('invariant: the mask holds until both the animation and the scene are ready', () => {
  test('MASK_COMPLETE alone does not reveal', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
    )
    expect(state.phase).toBe('swapping')
  })

  test('SCENE_READY alone does not reveal', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'SCENE_READY' },
    )
    expect(state.phase).toBe('masking')
  })

  test('a scene that resolves early still waits for the animation beat', () => {
    let state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SCENE_READY' }, // cached module: resolves during focusing
      { type: 'FOCUS_COMPLETE' },
    )
    expect(state.phase).toBe('masking')
    state = reduce(state, { type: 'MASK_COMPLETE' })
    expect(state.phase).toBe('revealing')
  })

  test('a slow scene simply holds the mask longer', () => {
    let state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'FOCUS_COMPLETE' },
      { type: 'MASK_COMPLETE' },
    )
    expect(state.phase).toBe('swapping')
    state = reduce(state, { type: 'SCENE_READY' })
    expect(state.phase).toBe('revealing')
  })
})

describe('invariant: non-interruptible past masking', () => {
  test('SELECT during focusing retargets', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SELECT', id: 'skiwatch' },
    )
    expect(state.phase).toBe('focusing')
    expect(state.target).toBe('skiwatch')
  })

  test('retargeting clears a scene-ready flag from the abandoned room', () => {
    const state = run(
      initialState,
      { type: 'SELECT', id: 'papercup' },
      { type: 'SCENE_READY' },
      { type: 'SELECT', id: 'skiwatch' },
    )
    expect(state.sceneReady).toBe(false)
  })

  test('a double SELECT of the same id is idempotent', () => {
    const once = reduce(initialState, { type: 'SELECT', id: 'papercup' })
    const twice = reduce(once, { type: 'SELECT', id: 'papercup' })
    expect(twice).toEqual(once)
  })

  test.each(['masking', 'swapping', 'revealing'] as const)(
    'SELECT is ignored during %s',
    (phase) => {
      const locked: TransitionState = {
        phase,
        target: 'papercup',
        direction: 'in',
        maskComplete: phase !== 'masking',
        sceneReady: phase === 'revealing',
      }
      expect(reduce(locked, { type: 'SELECT', id: 'skiwatch' })).toEqual(locked)
    },
  )

  test('EXIT is ignored while entering', () => {
    const state = run(initialState, { type: 'SELECT', id: 'papercup' }, { type: 'FOCUS_COMPLETE' })
    expect(reduce(state, { type: 'EXIT' })).toEqual(state)
  })

  test('isLocked reports the non-interruptible phases', () => {
    expect(isLocked({ ...initialState, phase: 'browsing' })).toBe(false)
    expect(isLocked({ ...initialState, phase: 'focusing' })).toBe(false)
    expect(isLocked({ ...initialState, phase: 'masking' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'swapping' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'revealing' })).toBe(true)
    expect(isLocked({ ...initialState, phase: 'inRoom' })).toBe(false)
  })
})

describe('leaving a room', () => {
  const inRoom: TransitionState = {
    phase: 'inRoom',
    target: 'papercup',
    direction: 'in',
    maskComplete: false,
    sceneReady: true,
  }

  test('EXIT masks outward without a focusing beat', () => {
    const state = reduce(inRoom, { type: 'EXIT' })
    expect(state.phase).toBe('masking')
    expect(state.direction).toBe('out')
  })

  test('the hub needs no load, so masking out reveals immediately', () => {
    const state = run(inRoom, { type: 'EXIT' }, { type: 'MASK_COMPLETE' })
    expect(state.phase).toBe('revealing')
  })

  test('returns to browsing with no target', () => {
    const state = run(
      inRoom,
      { type: 'EXIT' },
      { type: 'MASK_COMPLETE' },
      { type: 'REVEAL_COMPLETE' },
    )
    expect(state.phase).toBe('browsing')
    expect(state.target).toBeNull()
  })
})

describe('shouldMountScene', () => {
  test('does not mount while browsing', () => {
    expect(shouldMountScene(initialState)).toBe(false)
  })

  test('mounts from focusing onward so the download starts early', () => {
    for (const phase of ['focusing', 'masking', 'swapping', 'revealing', 'inRoom'] as const) {
      expect(shouldMountScene({ ...initialState, phase, target: 'papercup' })).toBe(true)
    }
  })

  test('unmounts once the exit reveal has begun', () => {
    expect(
      shouldMountScene({
        phase: 'revealing',
        target: 'papercup',
        direction: 'out',
        maskComplete: true,
        sceneReady: true,
      }),
    ).toBe(false)
  })
})
