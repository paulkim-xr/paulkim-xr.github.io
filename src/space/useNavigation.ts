import { useEffect, useRef, type RefObject } from 'react'
import type { Domain } from './domain'
import type { Press } from './gesture'
import type { Intents } from './intents'
import { runTechniques, type AnyTechnique, type Signals } from './technique'

/**
 * Raw input, collected between frames.
 *
 * Pointer events arrive whenever the browser feels like it and keys are a set
 * that changes under us, so both are gathered into refs and drained once per
 * frame. That is also what keeps the techniques pure: they are handed a
 * frame's worth of signal rather than subscribing to the window themselves.
 */
function useSignals(): { drain: (now: number) => Signals } {
  const keys = useRef(new Set<string>())
  const struck = useRef(new Set<string>())
  const presses = useRef<Press[]>([])

  useEffect(() => {
    const down = (event: PointerEvent) =>
      presses.current.push({
        kind: 'down',
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      })
    const move = (event: PointerEvent) =>
      presses.current.push({
        kind: 'move',
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      })
    const up = (event: PointerEvent) => presses.current.push({ kind: 'up', at: event.timeStamp })
    const cancel = (event: PointerEvent) =>
      presses.current.push({ kind: 'cancel', at: event.timeStamp })

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      // Held keys repeat their keydown. Only a key that was not already down
      // counts as struck, or an edge would fire on every repeat.
      if (!keys.current.has(key)) struck.current.add(key)
      keys.current.add(key)
    }
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    // A tab switch mid-press never delivers the keyup or the pointerup, leaving
    // the viewer walking forever on their return.
    const blur = () => {
      keys.current.clear()
      presses.current.push({ kind: 'cancel', at: performance.now() })
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)

    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const drain = (now: number): Signals => {
    // The tick is what lets a press held perfectly still become a walk: a
    // finger that does not move generates no events at all.
    const collected: Press[] = [...presses.current, { kind: 'tick', at: now }]
    presses.current = []

    // Snapshots, not the live sets: a technique handed the mutable set would
    // see it change under it as the browser delivers events mid-frame.
    const held = new Set(keys.current)
    const fresh = struck.current
    struck.current = new Set<string>()

    return { keys: held, struck: fresh, presses: collected, now }
  }

  return { drain }
}

/**
 * A domain, driven by whatever the visitor has to hand.
 *
 * State in refs rather than React state: it changes on every frame and every
 * pixel of a drag, and nothing in the tree renders differently for it.
 *
 * Nothing here subscribes to the frame loop. The caller decides when a frame's
 * worth of input is applied, which is what lets the rig advance the state and
 * read the pose it produced in the same callback rather than a frame apart.
 */
export function useNavigation<S>(
  domain: Domain<S>,
  techniques: readonly AnyTechnique[],
  /**
   * Anything the domain does not consume, handed to the room.
   *
   * A corridor has no opinion about `act`, but the room at the end of it does
   * — the string is picked up with the same tap that would otherwise do
   * nothing. Called once per frame from inside `advance`, so an edge is seen
   * exactly once however the frame loop is ordered.
   */
  onIntents?: (intents: Intents) => void,
): { state: RefObject<S>; advance: (seconds: number, now: number) => void } {
  const state = useRef<S>(domain.initial())
  const techniqueStates = useRef<unknown[]>(techniques.map((technique) => technique.initial()))
  const { drain } = useSignals()

  // Held in a ref so a room may pass a fresh closure every render without the
  // frame loop ending up with a stale one.
  const listener = useRef(onIntents)
  listener.current = onIntents

  const advance = (seconds: number, now: number) => {
    const outcome = runTechniques(techniques, techniqueStates.current, drain(now), seconds)
    techniqueStates.current = outcome.states
    state.current = domain.step(state.current, outcome.intents, seconds)
    listener.current?.(outcome.intents)
  }

  return { state, advance }
}
