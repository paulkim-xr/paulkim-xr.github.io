import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getRoom, rooms, roomIndex } from '../content/registry'
import { browsingIn, initialState } from '../transition/machine'
import { useTransition } from '../transition/useTransition'
import { Stage } from './Stage'

/** Milliseconds the focus beat runs before the mask begins closing. */
const FOCUS_MS = 450

export function App() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // A direct landing on /p/:id opens already masked and reveals — no carousel.
  const landedInRoom = useRef(Boolean(id && getRoom(id))).current
  const transition = useTransition(landedInRoom && id ? browsingIn(id) : initialState)
  const { state, focusComplete, select, exit } = transition

  const [activeIndex, setActiveIndex] = useState(() => Math.max(roomIndex(id ?? ''), 0))

  const step = useCallback((delta: number) => {
    setActiveIndex((current) => (((current + delta) % rooms.length) + rooms.length) % rooms.length)
  }, [])

  // The focusing beat is time-based; every other phase is driven by an event.
  useEffect(() => {
    if (state.phase !== 'focusing') return
    const timer = window.setTimeout(focusComplete, FOCUS_MS)
    return () => window.clearTimeout(timer)
  }, [state.phase, state.target, focusComplete])

  const currentPath = id ? `/p/${id}` : '/'
  /**
   * The path the machine last asked for, held until the router catches up.
   *
   * Both directions of sync are needed — the machine pushes history, and
   * back/forward pushes the machine — but without an authorship marker they
   * feed each other: on exit the machine reaches `browsing` while `id` is
   * still the room for one tick, and the URL-to-machine effect would
   * immediately re-select the room that was just left.
   */
  const pendingPath = useRef<string | null>(null)

  // Machine -> URL.
  useEffect(() => {
    let want: string | null = null
    if (state.phase === 'masking' && state.direction === 'in' && state.target) {
      want = `/p/${state.target}`
    } else if (state.phase === 'browsing') {
      want = '/'
    }

    if (want === null || want === currentPath) return
    pendingPath.current = want
    void navigate(want)
  }, [state.phase, state.direction, state.target, currentPath, navigate])

  // URL -> machine, but only for changes the machine did not author.
  useEffect(() => {
    if (pendingPath.current !== null) {
      if (pendingPath.current === currentPath) pendingPath.current = null
      return
    }
    if (state.phase === 'inRoom' && !id) exit()
    if (state.phase === 'browsing' && id && getRoom(id)) select(id)
  }, [id, currentPath, state.phase, exit, select])

  // Flat keyboard parity with the carousel's wheel and the XR thumbstick.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'Enter' && state.phase === 'browsing') select(rooms[activeIndex].id)
      if (event.key === 'Escape' && state.phase === 'inRoom') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, select, exit, state.phase, activeIndex])

  // Start the download the instant a selection is made, so it overlaps the
  // focus and mask animations rather than beginning after them.
  useEffect(() => {
    if (state.phase !== 'focusing' || !state.target) return
    void getRoom(state.target)?.scene.preload()
  }, [state.phase, state.target])

  return (
    <Canvas camera={{ position: [0, 0.6, 7], fov: 50 }} data-testid="scene">
      <Stage activeIndex={activeIndex} transition={transition} onStep={step} xrMode={false} />
    </Canvas>
  )
}
