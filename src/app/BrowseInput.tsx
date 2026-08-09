import { useEffect } from 'react'
import { cycleDomain } from '../space/domains/cycle'
import { stepKeysTechnique } from '../space/techniques/stepKeys'
import { stillPointerTechnique } from '../space/techniques/pointer'
import { wheelTechnique } from '../space/techniques/wheel'
import { useNavigation } from '../space/useNavigation'

type BrowseInputProps = {
  /** How many things are on the ring. */
  count: number
  /** Which one is in front, whenever that changes. */
  onIndex: (index: number) => void
  /** The one in front has been picked. */
  onChoose: (index: number) => void
}

/**
 * The hub's input, as a domain like any other.
 *
 * Mounted only while browsing, which is what keeps the arrows from reordering
 * the carousel behind your back from inside a room — and, because the signal
 * listeners go with it, stops a room's worth of drags queueing up to be
 * spent the moment you come back out.
 *
 * Outside the canvas and driving its own frame loop: the hub is a React tree
 * with a `Canvas` in it rather than something inside one, so there is no
 * `useFrame` to hang this on.
 *
 * Both of its input techniques are ring-specific, and deliberately so. The
 * pointer is the one that cannot walk, because a ring seen from one spot has
 * nowhere to go and the walking variant would swallow any click held longer
 * than its dwell. The keys are the ones that step rather than turn, because on
 * a list an arrow key means "next" and a tap of it has to move you by one
 * thing.
 */
export function BrowseInput({ count, onIndex, onChoose }: BrowseInputProps): null {
  const ring = useNavigation(cycleDomain(count), [
    stepKeysTechnique,
    stillPointerTechnique,
    wheelTechnique,
  ])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let chosen = false

    const tick = (now: number) => {
      // Clamped: a tab left in the background hands back one enormous frame,
      // and a ring stepped by a second and a half of banked turn would spin
      // past everything the moment the visitor came back.
      const seconds = Math.min(0.1, (now - last) / 1000)
      last = now

      ring.advance(seconds, now)
      onIndex(ring.state.current.index)

      // Once only. The domain latches `chosen` and stops taking input, but the
      // frame loop keeps running until this unmounts.
      if (ring.state.current.chosen && !chosen) {
        chosen = true
        onChoose(ring.state.current.index)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ring, onIndex, onChoose])

  return null
}
