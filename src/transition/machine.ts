export type Phase = 'browsing' | 'focusing' | 'masking' | 'swapping' | 'revealing' | 'inRoom'
export type Direction = 'in' | 'out'

export type TransitionState = {
  phase: Phase
  /** The room being entered, occupied, or left. Null only while browsing. */
  target: string | null
  direction: Direction
  /** The mask animation has finished covering the view. */
  maskComplete: boolean
  /** The lazy scene module has resolved and mounted. */
  sceneReady: boolean
}

export type TransitionEvent =
  | { type: 'SELECT'; id: string }
  | { type: 'FOCUS_COMPLETE' }
  | { type: 'MASK_COMPLETE' }
  | { type: 'SCENE_READY' }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'EXIT' }

export const initialState: TransitionState = {
  phase: 'browsing',
  target: null,
  direction: 'in',
  maskComplete: false,
  sceneReady: false,
}

/** Starting state for a direct landing on /p/:id — masked, awaiting the scene. */
export const browsingIn = (target: string): TransitionState => ({
  phase: 'masking',
  target,
  direction: 'in',
  maskComplete: false,
  sceneReady: false,
})

const LOCKED_PHASES: readonly Phase[] = ['masking', 'swapping', 'revealing']

/** True while user input must be ignored, so a double-select cannot double-load. */
export function isLocked(state: TransitionState): boolean {
  return LOCKED_PHASES.includes(state.phase)
}

/**
 * Whether the target room's lazy scene should be mounted.
 *
 * Exactly while the camera is framed for the room, and not a phase earlier.
 * Mounting during `focusing` to overlap the download seemed free, and is not:
 * the hub is still on screen through the focus and the mask, in hub framing,
 * so the room mounts *behind* it — a plinth and an info panel hanging in the
 * air behind the shape the viewer is in the middle of choosing.
 *
 * Nothing is lost by waiting. The download is started by `scene.preload()` the
 * instant a project is picked, which is what actually overlaps the animation;
 * mounting is only the moment React puts the result on screen.
 */
export function shouldMountScene(state: TransitionState): boolean {
  if (state.target === null) return false
  return usesRoomFraming(state)
}

/**
 * Whether the camera should use room framing rather than hub framing.
 *
 * The hub is a ring of radius 3 viewed from outside; a room is a plinth and a
 * panel a couple of metres away. One camera position cannot serve both. The
 * swap is free precisely because it happens while the void is fully closed —
 * entering, that is `swapping` onward; leaving, room framing is held until the
 * outward mask has finished closing.
 */
export function usesRoomFraming(state: TransitionState): boolean {
  if (state.direction === 'out') return state.phase === 'masking'
  return state.phase === 'swapping' || state.phase === 'revealing' || state.phase === 'inRoom'
}

/** Both gates open — the mask may lift. */
function readyToReveal(state: TransitionState): boolean {
  // Leaving a room reveals the hub, which is eager and always resident.
  const sceneGate = state.direction === 'out' ? true : state.sceneReady
  return state.maskComplete && sceneGate
}

/** Advance out of `swapping` only when both gates are open. */
function settle(state: TransitionState): TransitionState {
  if (state.phase !== 'swapping') return state
  return readyToReveal(state) ? { ...state, phase: 'revealing' } : state
}

export function reduce(state: TransitionState, event: TransitionEvent): TransitionState {
  switch (event.type) {
    case 'SELECT': {
      if (isLocked(state)) return state
      if (state.phase === 'inRoom') return state
      if (state.phase === 'focusing' && state.target === event.id) return state
      return {
        phase: 'focusing',
        target: event.id,
        direction: 'in',
        maskComplete: false,
        // A retarget abandons whatever the previous room had loaded.
        sceneReady: false,
      }
    }

    case 'FOCUS_COMPLETE': {
      if (state.phase !== 'focusing') return state
      return { ...state, phase: 'masking' }
    }

    case 'MASK_COMPLETE': {
      if (state.phase !== 'masking') return state
      return settle({ ...state, phase: 'swapping', maskComplete: true })
    }

    case 'SCENE_READY': {
      if (state.phase === 'browsing') return state
      return settle({ ...state, sceneReady: true })
    }

    case 'REVEAL_COMPLETE': {
      if (state.phase !== 'revealing') return state
      if (state.direction === 'out') return initialState
      return { ...state, phase: 'inRoom' }
    }

    case 'EXIT': {
      if (state.phase !== 'inRoom') return state
      return { ...state, phase: 'masking', direction: 'out', maskComplete: false }
    }
  }
}
