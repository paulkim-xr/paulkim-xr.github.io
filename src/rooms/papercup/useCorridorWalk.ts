import { useEffect, useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import { lookFrom, motionFrom, type Rates } from '../controls'
import { clampPitch } from '../svr/gaze'
import { strollTo, type Bounds, type Stroll } from './stroll'

/** Metres a second on foot, and radians a second turning. A walk, not a run. */
const RATES: Rates = { move: 3.4, look: 1.1 }

/**
 * Where the viewer is standing in the corridor and which way they are looking.
 *
 * The same split as the sphere room — feet in one place, head in another — but
 * over a flat floor, so where they stand is a point and a heading rather than a
 * whole orientation. Refs rather than state for the same reason: these change
 * on every pointer move and are read every frame, and nothing in the React tree
 * renders differently for them.
 */
export function useCorridorWalk(
  bounds: Bounds,
  start: { x: number; z: number; heading: number },
): {
  stroll: RefObject<Stroll>
  pitch: RefObject<number>
  advance: (seconds: number) => void
} {
  const stroll = useRef<Stroll>({
    position: new Vector3(start.x, 0, start.z),
    heading: start.heading,
  })
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

      // Negated against the sphere's sense of a turn: there, a positive turn is
      // a rotation about the axis the viewer's body is on, and here it is a
      // heading measured the other way round the floor. Same gesture, and it
      // has to move the room the same way in both.
      stroll.current = strollTo(
        stroll.current,
        { forward: 0, sideways: 0, turned: -look.turned },
        bounds,
      )
      pitch.current = clampPitch(pitch.current + look.tilted)
    }
    const up = () => {
      last = null
    }

    const keyDown = (event: KeyboardEvent) => held.current.add(event.key.toLowerCase())
    const keyUp = (event: KeyboardEvent) => held.current.delete(event.key.toLowerCase())
    // A tab switch mid-press never delivers the keyup, leaving the viewer
    // walking into a wall forever on their return.
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
  }, [bounds])

  const advance = (seconds: number) => {
    const { forward, sideways, turned, tilted } = motionFrom(held.current, seconds, RATES)

    if (forward !== 0 || sideways !== 0 || turned !== 0) {
      stroll.current = strollTo(stroll.current, { forward, sideways, turned: -turned }, bounds)
    }
    if (tilted !== 0) pitch.current = clampPitch(pitch.current + tilted)
  }

  return { stroll, pitch, advance }
}
