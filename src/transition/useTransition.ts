import { useMemo, useReducer } from 'react'
import { initialState, reduce, type TransitionState } from './machine'

export function useTransition(initial: TransitionState = initialState) {
  const [state, dispatch] = useReducer(reduce, initial)

  // Dispatch identity is stable, so these callbacks never change and no
  // consumer re-renders merely because a handler moved.
  const actions = useMemo(
    () => ({
      select: (id: string) => dispatch({ type: 'SELECT', id }),
      exit: () => dispatch({ type: 'EXIT' }),
      focusComplete: () => dispatch({ type: 'FOCUS_COMPLETE' }),
      maskComplete: () => dispatch({ type: 'MASK_COMPLETE' }),
      sceneReady: () => dispatch({ type: 'SCENE_READY' }),
      revealComplete: () => dispatch({ type: 'REVEAL_COMPLETE' }),
    }),
    [],
  )

  return useMemo(() => ({ state, ...actions }), [state, actions])
}

export type Transition = ReturnType<typeof useTransition>
