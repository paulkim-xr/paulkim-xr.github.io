import { useEffect, useRef, type RefObject } from 'react'
import { initialStance, walk, type Stance } from './walk'

/** Radians of arc walked per pixel of drag. A screen's width is most of a turn. */
const ARC_PER_PIXEL = 0.0022
/** Radians of arc per second while an arrow key is held. */
const ARC_PER_SECOND = 0.85

/**
 * Where the viewer is standing, driven by drag and by the arrow keys.
 *
 * A ref rather than state: the stance changes on every pointer move and is read
 * on every frame, and nothing in the React tree renders differently because of
 * it — the camera is moved directly. Putting it through state would re-render
 * the room on each pixel of a drag.
 */
export function useWalkControls(): {
  stance: RefObject<Stance>
  advance: (seconds: number) => void
} {
  const stance = useRef<Stance>(initialStance())
  const held = useRef(new Set<string>())

  useEffect(() => {
    let last: { x: number; y: number } | null = null

    const down = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY }
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      const dx = event.clientX - last.x
      const dy = event.clientY - last.y
      last = { x: event.clientX, y: event.clientY }

      // Drag pulls the shell with the hand: dragging down walks the surface up
      // past the viewer, which is the direction a hand on a globe expects.
      stance.current = walk(stance.current, {
        forward: dy * ARC_PER_PIXEL,
        sideways: dx * ARC_PER_PIXEL,
      })
    }
    const up = () => {
      last = null
    }

    const keyDown = (event: KeyboardEvent) => held.current.add(event.key)
    const keyUp = (event: KeyboardEvent) => held.current.delete(event.key)
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
    const keys = held.current
    if (keys.size === 0) return

    const arc = ARC_PER_SECOND * seconds
    const forward = (keys.has('ArrowDown') ? arc : 0) - (keys.has('ArrowUp') ? arc : 0)
    const sideways = (keys.has('ArrowRight') ? arc : 0) - (keys.has('ArrowLeft') ? arc : 0)
    if (forward === 0 && sideways === 0) return

    stance.current = walk(stance.current, { forward, sideways })
  }

  return { stance, advance }
}
