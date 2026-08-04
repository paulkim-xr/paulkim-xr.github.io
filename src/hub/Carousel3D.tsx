import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { Group } from 'three'
import type { Room } from '../content/registry'
import { damp } from '../lib/damp'
import { ringPositions, targetRotation } from './ring'

const RADIUS = 3
const SPIN_LAMBDA = 6
/** Horizontal pointer travel, in pixels, that counts as one carousel step. */
const DRAG_STEP_PX = 110

type Carousel3DProps = {
  rooms: Room[]
  activeIndex: number
  onStep: (delta: number) => void
  onSelect: (id: string) => void
  /** True once a transition has begun — the ring stops accepting input. */
  dimmed: boolean
}

/**
 * Pointer-drag stepping, bound at the window rather than to the ring geometry
 * so a drag that starts on empty space still works. The spec's parity table
 * lists "scroll / drag" for the flat carousel; this is the drag half.
 */
function useDragStep(onStep: (delta: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let originX: number | null = null

    const down = (event: PointerEvent) => {
      originX = event.clientX
    }
    const move = (event: PointerEvent) => {
      if (originX === null) return
      const travel = event.clientX - originX
      if (Math.abs(travel) < DRAG_STEP_PX) return
      onStep(-Math.sign(travel)) // drag right reveals the item to the left
      originX = event.clientX
    }
    const up = () => {
      originX = null
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [onStep, enabled])
}

export function Carousel3D({ rooms, activeIndex, onStep, onSelect, dimmed }: Carousel3DProps) {
  const ring = useRef<Group>(null)
  const rotation = useRef(0)
  const positions = useMemo(() => ringPositions(rooms.length, RADIUS), [rooms.length])

  useDragStep(onStep, !dimmed)

  useFrame((_state, delta) => {
    if (!ring.current) return
    const goal = targetRotation(rotation.current, activeIndex, rooms.length)
    rotation.current = damp(rotation.current, goal, SPIN_LAMBDA, delta)
    ring.current.rotation.y = rotation.current
  })

  return (
    <group
      ref={ring}
      onWheel={(event) => {
        if (dimmed) return
        event.stopPropagation()
        onStep(Math.sign(event.deltaY))
      }}
    >
      {rooms.map((room, index) => {
        const Preview = room.preview
        const selected = index === activeIndex
        return (
          <group
            key={room.id}
            position={positions[index]}
            onClick={(event) => {
              event.stopPropagation()
              if (dimmed) return
              if (selected) onSelect(room.id)
              else onStep(index - activeIndex)
            }}
            onPointerOver={(event) => event.stopPropagation()}
          >
            <ItemFacing rotationRef={rotation}>
              <Preview selected={selected} />
            </ItemFacing>
          </group>
        )
      })}
    </group>
  )
}

/**
 * Counter-rotates a ring item so it always faces the viewer regardless of where
 * the ring has spun to. Cheaper and steadier than a per-frame lookAt.
 */
function ItemFacing({
  rotationRef,
  children,
}: {
  rotationRef: RefObject<number>
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.rotation.y = -rotationRef.current
  })
  return <group ref={group}>{children}</group>
}

export { RADIUS }
