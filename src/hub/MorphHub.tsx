import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, FrontSide, type Group, type MeshBasicMaterial } from 'three'
import type { Room } from '../content/registry'
import { CanvasText } from '../lib/CanvasText'
import { WigglyGeometry } from '../lib/morph/WigglyGeometry'
import { browseHint, coarsePointer } from '../lib/pointer'
import { EDGE_OPACITY, FILL_OPACITY, ShapeSurface } from '../shape/ShapeSurface'
import type { Direction, Phase } from '../transition/machine'
import { usePhaseProgress } from '../transition/usePhaseClock'
import { whiteoutAt } from '../transition/whiteout'
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

/** Past this much whitening the labels are under the shape, so stop drawing them. */
const LABELS_GONE = 0.4

const WHITE = new Color('#ffffff')
/**
 * What the wireframe becomes while the fill turns white.
 *
 * Not white as well. A solid white body with white edges is a blank blob —
 * the posture the shape was holding when it was picked stops being readable at
 * exactly the moment it is supposed to be the whole point. The edges go grey
 * instead, so what swells into the camera is a white mask with its outline
 * still on it.
 */
const OUTLINE = new Color('#8b91a3')

const IDLE_SPIN = 0.22
const SHAPE_SCALE = 1.15

type MorphHubProps = {
  rooms: Room[]
  activeIndex: number
  /** Drives the whiteout: what the shape does after it has been chosen. */
  phase: Phase
  direction: Direction
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/**
 * One layer of the cross-fade: dissolve, cross-fade weight and whiteout at once.
 *
 * The whiteout is applied last and wins, because it is what turns a browsing
 * shape into a door. At full whiten the layer is opaque regardless of where the
 * morph's dissolve had got to.
 */
function applyLayer(
  fill: MeshBasicMaterial | null,
  edge: MeshBasicMaterial | null,
  presence: number,
  weight: number,
  accent: Color,
  whiten: number,
) {
  if (fill) {
    fill.opacity = mix(FILL_OPACITY * presence, 1, whiten) * weight
    fill.color.copy(accent).lerp(WHITE, whiten)
    fill.visible = fill.opacity > INVISIBLE
  }
  if (edge) {
    const dissolved = EDGE_FLOOR + (EDGE_OPACITY - EDGE_FLOOR) * presence
    edge.opacity = mix(dissolved, 1, whiten) * weight
    edge.color.copy(accent).lerp(OUTLINE, whiten)
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
export function MorphHub({ rooms, activeIndex, phase, direction }: MorphHubProps) {
  const clock = useThree((state) => state.clock)
  const spinner = useRef<Group>(null)
  const labels = useRef<Group>(null)
  const room = rooms[activeIndex]
  const progressNow = usePhaseProgress(phase, direction)

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

  /**
   * The colour each layer was bound with.
   *
   * Written where the layer is bound and read every frame, because the whiteout
   * lerps away from it — so it cannot be derived from `room`, which has already
   * moved on to whatever the viewer stepped to, and it is worth holding as a
   * Color rather than re-parsing a hex string sixty times a second.
   */
  const outgoingAccent = useMemo(() => new Color(), [])
  const incomingAccent = useMemo(() => new Color(), [])

  /**
   * Whether the surfaces are currently drawing their far side.
   *
   * They have to, once the shape is large enough to have the camera inside it:
   * with front faces alone the shape would simply vanish at the moment it
   * swallows the viewer, leaving a hole in the transition until the sheet
   * arrives. Flipped on the crossing rather than per frame, because changing
   * `side` invalidates the material's program.
   */
  const doubleSided = useRef(false)

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
      incomingAccent.set(room.accent)
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
      outgoingAccent.set(shownAccent.current)
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
      incomingAccent.set(target.accent)
      shownAccent.current = target.accent
    }

    const { whiten, swell } = whiteoutAt(phase, direction, progressNow())

    // Frozen from the instant it is picked. The shape is supposed to be the
    // posture it was caught in, so neither the idle wiggle nor a morph still in
    // flight may move a vertex once the whitening has begun.
    if (whiten === 0) geometry.updateVertices(now)

    const { presence, blend } = morphFade(elapsed, TIMING)

    // Before the first morph there is nothing to fade out of, so the opening
    // shape gets the incoming layer to itself rather than being drawn twice at
    // half strength.
    const outgoingWeight = hasMorphed.current ? 1 - blend : 0
    applyLayer(
      outgoingFill.current,
      outgoingEdge.current,
      presence,
      outgoingWeight,
      outgoingAccent,
      whiten,
    )
    applyLayer(
      incomingFill.current,
      incomingEdge.current,
      presence,
      hasMorphed.current ? blend : 1,
      incomingAccent,
      whiten,
    )

    const wantsFarSide = whiten > 0
    if (doubleSided.current !== wantsFarSide) {
      doubleSided.current = wantsFarSide
      for (const material of [
        outgoingFill.current,
        outgoingEdge.current,
        incomingFill.current,
        incomingEdge.current,
      ]) {
        if (!material) continue
        material.side = wantsFarSide ? DoubleSide : FrontSide
        material.needsUpdate = true
      }
    }

    if (spinner.current) {
      // The spin stops with everything else: a shape that keeps turning while
      // it swells reads as scenery going past rather than a door opening.
      if (whiten === 0) spinner.current.rotation.y += delta * IDLE_SPIN
      spinner.current.scale.setScalar(SHAPE_SCALE * swell)
    }

    if (labels.current) labels.current.visible = whiten < LABELS_GONE
  })

  return (
    <group>
      {/* Scale is driven per frame by the whiteout, so this is only where it
          starts — before the first frame has had a chance to set it. */}
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
      </group>

      {/* Outside the spinning group: a label that turns away is no label. */}
      <group ref={labels}>
        <CanvasText position={[0, -1.25, 0]} fontSize={0.2} anchorX="center" color="#ffffff">
          {room.title}
        </CanvasText>

        <CanvasText position={[0, -1.52, 0]} fontSize={0.075} anchorX="center" color="#6f7787">
          {browseHint(touch)}
        </CanvasText>
      </group>
    </group>
  )
}
