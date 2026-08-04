import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type BufferAttribute, type Group, type MeshBasicMaterial } from 'three'
import type { Room } from '../content/registry'
import { DISPLAY_FONT } from '../lib/font'
import { WigglyGeometry } from '../lib/morph/WigglyGeometry'
import { EDGE_OPACITY, FILL_OPACITY, ShapeSurface } from '../shape/ShapeSurface'
import { bufferSizeFor } from './budget'
import { morphFade, type MorphTiming } from './fade'
import { wiggleMoves } from './wiggle'

/** Seconds a vertex spends in flight between one project's shape and the next. */
const MORPH_SECONDS = 1.1

/**
 * The dissolve envelope around a morph. The surface leaves before any vertex
 * moves and comes back over the flight's tail, so it reassembles as the
 * vertices land rather than snapping on once they have.
 */
const TIMING: MorphTiming = { lead: 0.3, flight: MORPH_SECONDS, restore: 0.55 }

/**
 * How far the wireframe thins out at full dissolve. Not to nothing: the edges
 * are the only thing that makes the flight legible, and a shape that vanishes
 * entirely reads as a glitch rather than a transformation.
 */
const EDGE_FLOOR = 0.3

const IDLE_SPIN = 0.22
const SHAPE_SCALE = 1.15
/** Radius of the click target. Comfortably larger than any shape's silhouette. */
const HIT_RADIUS = 1.05
/** Horizontal pointer travel, in pixels, that counts as one step. */
const DRAG_STEP_PX = 110

type MorphHubProps = {
  rooms: Room[]
  activeIndex: number
  onStep: (delta: number) => void
  onSelect: (id: string) => void
  /** True once a transition has begun — the hub stops accepting input. */
  dimmed: boolean
}

/**
 * Wheel and drag stepping, bound at the window rather than to the shape, so
 * input works anywhere in the viewport instead of only over a silhouette that
 * is a different size every second of the morph.
 */
function usePointerStep(onStep: (delta: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let originX: number | null = null

    const wheel = (event: WheelEvent) => onStep(Math.sign(event.deltaY))
    const down = (event: PointerEvent) => {
      originX = event.clientX
    }
    const move = (event: PointerEvent) => {
      if (originX === null) return
      const travel = event.clientX - originX
      if (Math.abs(travel) < DRAG_STEP_PX) return
      onStep(-Math.sign(travel)) // drag right brings the previous project forward
      originX = event.clientX
    }
    const up = () => {
      originX = null
    }

    window.addEventListener('wheel', wheel)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('wheel', wheel)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [onStep, enabled])
}

/**
 * The hub: one object that morphs from each project's shape into the next.
 *
 * Not a ring of five objects taking turns. Every vertex of the shape you are
 * looking at flies to a vertex of the shape you asked for, so browsing is a
 * single continuous body rather than a carousel of separate ones.
 */
export function MorphHub({ rooms, activeIndex, onStep, onSelect, dimmed }: MorphHubProps) {
  const clock = useThree((state) => state.clock)
  const spinner = useRef<Group>(null)
  const room = rooms[activeIndex]

  const bufferSize = useMemo(() => bufferSizeFor(rooms.map((entry) => entry.shape)), [rooms])

  // Which shape the geometry was born holding. Captured once: rebuilding the
  // geometry on every step would throw away the morph it exists to perform.
  const openingIndex = useRef(activeIndex).current

  const geometry = useMemo(() => {
    const wiggly = new WigglyGeometry({
      geometry: rooms[openingIndex].shape(),
      startTime: clock.getElapsedTime(),
      bufferSize,
      transitionTime: MORPH_SECONDS,
    })
    // The constructor starts from a zero-radius tetrahedron, so the opening
    // shape blooms out of a single point rather than snapping into being.
    wiggly.setMoves(wiggleMoves(wiggly))
    return wiggly
  }, [rooms, openingIndex, bufferSize, clock])

  useEffect(() => () => geometry.dispose(), [geometry])

  /**
   * A step requested but not yet started, held through the dissolve.
   *
   * The morph cannot begin on the keypress: the surface has to leave first, or
   * the vertices fly while solid faces are still stretched between them. A
   * second step arriving during the lead overwrites this one rather than
   * queueing, so spinning through the list skips the shapes passed over
   * instead of playing a morph for each.
   */
  const pending = useRef<number | null>(null)
  /** When the current envelope began. Null until the first frame. */
  const steppedAt = useRef<number | null>(null)

  const shown = useRef(openingIndex)
  useEffect(() => {
    if (shown.current === activeIndex) return
    shown.current = activeIndex
    pending.current = activeIndex
    steppedAt.current = clock.getElapsedTime()
  }, [activeIndex, clock])

  usePointerStep(onStep, !dimmed)

  // See the frame loop: three caches one wireframe index per geometry and
  // only rebuilds it when the index attribute's version *increases*.
  const drawnIndex = useRef<BufferAttribute | null>(null)
  const indexVersion = useRef(0)

  const fillMaterial = useRef<MeshBasicMaterial>(null)
  const edgeMaterial = useRef<MeshBasicMaterial>(null)
  /** The accent being faded away from. Colour cannot snap mid-flight. */
  const leavingAccent = useRef(room.accent)
  // Reused every frame; allocating two Colors per frame is pure garbage.
  const scratch = useMemo(() => ({ blended: new Color(), arriving: new Color() }), [])

  useFrame((state, delta) => {
    const now = state.clock.getElapsedTime()

    // First frame: the opening bloom is already vertices in flight, so the
    // envelope joins at the end of the lead rather than dissolving a shape
    // that has not appeared yet.
    if (steppedAt.current === null) steppedAt.current = now - TIMING.lead

    const elapsed = now - steppedAt.current

    // The dissolve has to finish before the vertices move, so the morph is
    // started here rather than in the effect that recorded the step.
    if (pending.current !== null && elapsed >= TIMING.lead) {
      const target = rooms[pending.current]
      pending.current = null
      geometry.transformTo(target.shape(), now, false)
      // After transformTo, `vertices` is the destination — so these idle
      // movements are anchored to where the shape is going, not where it was.
      geometry.setMoves(wiggleMoves(geometry))
    }

    geometry.updateVertices(now)

    // WigglyGeometry swaps its index attribute wholesale — once when a morph
    // starts and once when it settles — and a swapped-in attribute starts at
    // version 0. Left alone, the wireframe keeps drawing the shape before
    // last: edges spanning parts that are no longer connected, and none at
    // all over parts that are. The bump has to be monotonic, because the
    // cache compares against whatever version it last built at.
    if (geometry.index && geometry.index !== drawnIndex.current) {
      drawnIndex.current = geometry.index
      geometry.index.version = ++indexVersion.current
    }

    const { presence, blend } = morphFade(elapsed, TIMING)

    scratch.blended.set(leavingAccent.current).lerp(scratch.arriving.set(room.accent), blend)
    if (blend >= 1) leavingAccent.current = room.accent

    const fill = fillMaterial.current
    if (fill) {
      fill.opacity = FILL_OPACITY * presence
      // A fully dissolved fill is a draw call rendering nothing.
      fill.visible = presence > 0.01
      fill.color.copy(scratch.blended)
    }

    const edge = edgeMaterial.current
    if (edge) {
      edge.opacity = EDGE_FLOOR + (EDGE_OPACITY - EDGE_FLOOR) * presence
      edge.color.copy(scratch.blended)
    }

    if (spinner.current) spinner.current.rotation.y += delta * IDLE_SPIN
  })

  return (
    <group>
      <group ref={spinner} scale={SHAPE_SCALE}>
        <ShapeSurface
          geometry={geometry}
          accent={room.accent}
          fillRef={fillMaterial}
          edgeRef={edgeMaterial}
        />

        {/* Click target. A plain sphere is a steadier and far cheaper raycast
            hit than a few hundred vertices in mid-flight, and it gives an XR
            controller ray something forgiving to land on. The material is
            invisible rather than the mesh: an invisible *object* is skipped by
            the raycaster entirely, which would make the hub unclickable. */}
        <mesh
          onClick={(event) => {
            event.stopPropagation()
            if (dimmed) return
            onSelect(room.id)
          }}
          onPointerOver={(event) => {
            event.stopPropagation()
            if (!dimmed) document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        >
          <sphereGeometry args={[HIT_RADIUS, 12, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>

      {/* Outside the spinning group: a label that turns away is no label. */}
      <Text
        font={DISPLAY_FONT}
        position={[0, -1.25, 0]}
        fontSize={0.2}
        anchorX="center"
        color="#ffffff"
      >
        {room.title}
      </Text>

      <Text
        font={DISPLAY_FONT}
        position={[0, -1.52, 0]}
        fontSize={0.075}
        anchorX="center"
        color="#6f7787"
      >
        ← → to browse · click to enter
      </Text>
    </group>
  )
}
