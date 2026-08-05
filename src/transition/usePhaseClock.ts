import { useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Direction, Phase } from './machine'
import { durationFor } from './whiteout'

/**
 * How far through the current phase we are, readable from inside a frame loop.
 *
 * Returns a getter rather than a number: progress changes every frame and is
 * only ever consumed inside `useFrame`, so routing it through React state would
 * re-render the scene sixty times a second to move one float.
 *
 * The origin is reset by the first *frame* that sees a new phase, not by an
 * effect. It has to be: R3F drives its loop from requestAnimationFrame, React
 * flushes passive effects asynchronously, and the frame after a phase change
 * can therefore run before an effect would have moved the origin. When it does,
 * the new phase inherits the old one's start time, reads as long finished, and
 * reports itself complete immediately — which collapsed the whole transition
 * into about a frame and a half.
 *
 * Every consumer of the whiteout calls this for itself rather than one
 * component computing it and handing it around. Two components reading the same
 * clock against the same origin agree by construction; a value passed between
 * them would depend on whose frame callback happened to be registered first.
 */
export function usePhaseProgress(phase: Phase, direction: Direction): () => number {
  const clock = useThree((state) => state.clock)
  const startedAt = useRef(clock.getElapsedTime())
  const seenPhase = useRef(phase)
  const seenDirection = useRef(direction)

  return () => {
    const now = clock.getElapsedTime()

    if (seenPhase.current !== phase || seenDirection.current !== direction) {
      seenPhase.current = phase
      seenDirection.current = direction
      startedAt.current = now
    }

    return (now - startedAt.current) / durationFor(phase)
  }
}
