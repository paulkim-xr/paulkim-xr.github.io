import { useEffect, useRef, type RefObject } from 'react'
import { lookFrom, motionFrom } from './controls'
import { clampPitch } from './gaze'
import { initialStance, turn, walk, type Stance } from './walk'

/**
 * Where the viewer is standing and which way they are looking.
 *
 * Two things rather than one, and keeping them apart is the point. The stance
 * is where their feet are on the shell; the pitch is how far back their head is
 * tilted. Walking carries the head with it, so the horizon stays the horizon as
 * they go — and looking up at the object leaves them standing exactly where
 * they were.
 *
 * Both are refs rather than state: they change on every pointer move and are
 * read on every frame, nothing in the React tree renders differently for them,
 * and putting either through state would re-render the room on each pixel of a
 * drag.
 */
export function useFirstPerson(): {
  stance: RefObject<Stance>
  pitch: RefObject<number>
  advance: (seconds: number) => void
} {
  const stance = useRef<Stance>(initialStance())
  const pitch = useRef(0)
  const held = useRef(new Set<string>())

  useEffect(() => {
    let last: { x: number; y: number } | null = null

    const down = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY }
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      const look = lookFrom(event.clientX - last.x, event.clientY - last.y)
      last = { x: event.clientX, y: event.clientY }

      stance.current = turn(stance.current, look.turned)
      pitch.current = clampPitch(pitch.current + look.tilted)
    }
    const up = () => {
      last = null
    }

    const keyDown = (event: KeyboardEvent) => held.current.add(event.key.toLowerCase())
    const keyUp = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase())
    // A tab switch mid-press never delivers the keyup, leaving the viewer
    // walking forever on their return.
    const blur = () => held.current.clear()

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)

    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** Applies whatever keys are held for a frame of `seconds`. */
  const advance = (seconds: number) => {
    const { forward, sideways, turned, tilted } = motionFrom(held.current, seconds)

    if (forward !== 0 || sideways !== 0) stance.current = walk(stance.current, { forward, sideways })
    if (turned !== 0) stance.current = turn(stance.current, turned)
    if (tilted !== 0) pitch.current = clampPitch(pitch.current + tilted)
  }

  return { stance, pitch, advance }
}
