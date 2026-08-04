import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, MeshBasicMaterial } from 'three'
import type { Room } from '../content/registry'
import { DISPLAY_FONT } from '../lib/font'
import { WigglyGeometry } from '../lib/morph/WigglyGeometry'
import { browseHint, coarsePointer } from '../lib/pointer'
import { EDGE_OPACITY, FILL_OPACITY, ShapeSurface } from '../shape/ShapeSurface'
import { bufferSizeFor } from './budget'
import { morphFade, type MorphTiming } from './fade'
import { bindTopology, createTopology, releaseTopology } from './topology'
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

/** Below this, a layer is a draw call rendering nothing. */
const INVISIBLE = 0.002

const IDLE_SPIN = 0.22
const SHAPE_SCALE = 1.15
/** Radius of the click target. Comfortably larger than any shape's silhouette. */
const HIT_RADIUS = 1.05
/** Horizontal pointer travel, in pixels, that counts as one step. */
const DRAG_STEP_PX = 110
/**
 * Travel, in pixels, past which a gesture stops being a tap.
 *
 * A finger never lands and lifts on exactly one pixel, so a tap needs a little
 * tolerance; a swipe needs to not be mistaken for one at any cost.
 */
const TAP_SLOP_PX = 10

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
 *
 * Returns whether the gesture in progress has become a drag. The hub's hit
 * sphere needs this: a browser fires `click` on pointer-up whether the pointer
 * moved a pixel or crossed the screen, so without it every swipe also selects
 * whatever it finished on top of. On a phone, where swiping is the only way to
 * browse at all, that means the site opens a room you were scrolling past.
 */
function usePointerStep(onStep: (delta: number) => void, enabled: boolean) {
  const dragged = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let originX: number | null = null
    let downX = 0
    let downY = 0

    const wheel = (event: WheelEvent) => onStep(Math.sign(event.deltaY))
    const down = (event: PointerEvent) => {
      originX = event.clientX
      downX = event.clientX
      downY = event.clientY
      dragged.current = false
    }
    const move = (event: PointerEvent) => {
      if (originX === null) return

      // Measured from where the finger landed, not from the last step: the
      // step origin is reset on every step, so travel from it says nothing
      // about whether this gesture as a whole was a tap.
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > TAP_SLOP_PX) {
        dragged.current = true
      }

      const travel = event.clientX - originX
      if (Math.abs(travel) < DRAG_STEP_PX) return
      onStep(-Math.sign(travel)) // drag right brings the previous project forward
      originX = event.clientX
    }
    // `dragged` deliberately survives pointer-up: the click it has to suppress
    // is dispatched after it. The next pointer-down clears it.
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

  return dragged
}

/** Opacity for one layer of the cross-fade, dissolve and weight combined. */
function applyLayer(
  fill: MeshBasicMaterial | null,
  edge: MeshBasicMaterial | null,
  presence: number,
  weight: number,
) {
  if (fill) {
    fill.opacity = FILL_OPACITY * presence * weight
    fill.visible = fill.opacity > INVISIBLE
  }
  if (edge) {
    edge.opacity = (EDGE_FLOOR + (EDGE_OPACITY - EDGE_FLOOR) * presence) * weight
    edge.visible = edge.opacity > INVISIBLE
  }
}

/**
 * The hub: one object that morphs from each project's shape into the next.
 *
 * Not a ring of five objects taking turns. Every vertex of the shape you are
 * looking at flies to a vertex of the shape you asked for, so browsing is a
 * single continuous body rather than a carousel of separate ones.
 *
 * The vertices come from one WigglyGeometry, which is never drawn directly.
 * What gets drawn is two topologies over its position buffer — the shape being
 * left and the shape being flown to — cross-fading across the flight.
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

  const outgoing = useMemo(createTopology, [])
  const incoming = useMemo(createTopology, [])

  useEffect(
    () => () => {
      releaseTopology(outgoing)
      releaseTopology(incoming)
      geometry.dispose()
    },
    [geometry, outgoing, incoming],
  )

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
  /** Whether `outgoing` has been pointed at the shape now leaving. */
  const outgoingBound = useRef(false)

  const shown = useRef(openingIndex)
  useEffect(() => {
    if (shown.current === activeIndex) return
    shown.current = activeIndex
    pending.current = activeIndex
    outgoingBound.current = false
    steppedAt.current = clock.getElapsedTime()
  }, [activeIndex, clock])

  const dragged = usePointerStep(onStep, !dimmed)

  // Read once. A pointer type does not change mid-visit, and re-reading it
  // every frame would re-lay out the text.
  const touch = useMemo(coarsePointer, [])

  const outgoingFill = useRef<MeshBasicMaterial>(null)
  const outgoingEdge = useRef<MeshBasicMaterial>(null)
  const incomingFill = useRef<MeshBasicMaterial>(null)
  const incomingEdge = useRef<MeshBasicMaterial>(null)

  /** Monotonic across both topologies — see bindTopology. */
  const topologyVersion = useRef(0)
  /** False until the first morph, when there is nothing to fade out of. */
  const hasMorphed = useRef(false)
  /** The accent of the shape on screen, which `room` has already moved past. */
  const shownAccent = useRef(room.accent)
  const started = useRef(false)

  useFrame((state, delta) => {
    const now = state.clock.getElapsedTime()
    const position = geometry.attributes.position

    // First frame: the opening bloom is already vertices in flight, so the
    // envelope joins at the end of the lead rather than dissolving a shape
    // that has not appeared yet.
    if (!started.current) {
      started.current = true
      steppedAt.current = now - TIMING.lead
      bindTopology(incoming, position, geometry.parameters.index, ++topologyVersion.current)
      incomingFill.current?.color.set(room.accent)
      incomingEdge.current?.color.set(room.accent)
    }

    const elapsed = now - (steppedAt.current ?? now)

    // Capture what is on screen before anything moves. This has to happen at
    // the start of the lead rather than at transformTo: for those 0.3s the
    // outgoing layer is the only one visible, and it would otherwise still be
    // pointed at the shape from the morph before last.
    if (pending.current !== null && !outgoingBound.current) {
      outgoingBound.current = true
      hasMorphed.current = true
      bindTopology(outgoing, position, geometry.index, ++topologyVersion.current)
      outgoingFill.current?.color.set(shownAccent.current)
      outgoingEdge.current?.color.set(shownAccent.current)
    }

    // The dissolve has to finish before the vertices move, so the morph is
    // started here rather than in the effect that recorded the step.
    if (pending.current !== null && elapsed >= TIMING.lead) {
      const target = rooms[pending.current]
      pending.current = null

      geometry.transformTo(target.shape(), now, false)
      // After transformTo, `vertices` is the destination — so these idle
      // movements are anchored to where the shape is going, not where it was.
      geometry.setMoves(wiggleMoves(geometry))

      bindTopology(incoming, position, geometry.parameters.index, ++topologyVersion.current)
      incomingFill.current?.color.set(target.accent)
      incomingEdge.current?.color.set(target.accent)
      shownAccent.current = target.accent
    }

    geometry.updateVertices(now)

    const { presence, blend } = morphFade(elapsed, TIMING)

    // Before the first morph there is nothing to fade out of, so the opening
    // shape gets the incoming layer to itself rather than being drawn twice at
    // half strength.
    applyLayer(outgoingFill.current, outgoingEdge.current, presence, hasMorphed.current ? 1 - blend : 0)
    applyLayer(incomingFill.current, incomingEdge.current, presence, hasMorphed.current ? blend : 1)

    if (spinner.current) spinner.current.rotation.y += delta * IDLE_SPIN
  })

  return (
    <group>
      <group ref={spinner} scale={SHAPE_SCALE}>
        {/* The shape being left, and the shape being flown to, over the same
            vertices. Both are always mounted; the cross-fade turns them on and
            off, and a layer at zero opacity is skipped by the renderer. */}
        <ShapeSurface
          geometry={outgoing}
          accent={room.accent}
          fillRef={outgoingFill}
          edgeRef={outgoingEdge}
        />
        <ShapeSurface
          geometry={incoming}
          accent={room.accent}
          fillRef={incomingFill}
          edgeRef={incomingEdge}
        />

        {/* Click target. A plain sphere is a steadier and far cheaper raycast
            hit than a few hundred vertices in mid-flight, and it gives an XR
            controller ray something forgiving to land on. The material is
            invisible rather than the mesh: an invisible *object* is skipped by
            the raycaster entirely, which would make the hub unclickable. */}
        <mesh
          onClick={(event) => {
            event.stopPropagation()
            if (dimmed || dragged.current) return
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
        {browseHint(touch)}
      </Text>
    </group>
  )
}
