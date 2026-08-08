import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  TubeGeometry,
  Vector3,
  type LineSegments,
} from 'three'
import type { Room } from '../../content/registry'
import { CanvasText } from '../../lib/CanvasText'
import { LinkButton } from '../../lib/LinkButton'
import { lookFrom } from '../controls'
import { requirePlace, unreachable } from './graph'
import { ARRIVAL_PLACE, resort, type Link, type PlaceKind, type Resort } from './resort'
import { contourRings, curveOf, mastOf, segmentsOf, slopeRibbon } from './terrain'
import { advance, depart, focusOf, look, pointedAt, positionOf, startAt } from './travel'

/** How far above the graph the viewer's eye sits. */
const EYE_HEIGHT = 1.7
/** How far the mast under each place reaches down towards the ground. */
const MAST_DROP = 1.6

const LIFT_RADIUS = 0.055
const SLOPE_WIDTH = 1.15

/** How fast the view eases onto a new heading, per second. */
const EASE = 4.5

/** How far below the graph's own heading the room opens. */
const ARRIVAL_TILT = -0.24

const CONTOUR_COLOUR = '#2b3b46'
const LIFT_COLOUR = '#8ce0c0'
const SLOPE_COLOUR = '#4e8f9c'
const GAP_COLOUR = '#7d6b8f'
const CHOSEN_COLOUR = '#ffffff'

/** What each kind of place is drawn as, so the registry's entries are not all one thing. */
const PLACE_SIZE: Record<PlaceKind, number> = {
  base: 0.42,
  station: 0.34,
  summit: 0.46,
  junction: 0.26,
  webcam: 0.2,
}

/**
 * The open-ski-data room: a mountain that exists only as its own data.
 *
 * There is no hillside here. The registry does not hold a mountain, it holds
 * measurements of one — places, lifts, runs, and the graph joining them — so
 * the room draws exactly that and no more: contour rings at surveyed heights,
 * cables between towers, runs as ribbons of ground, and a lit marker at every
 * place that has an entry.
 *
 * The viewer travels the graph rather than walking about, because the graph is
 * the thing. From wherever they are standing they can look round the ways out
 * and take one, and the ride is the ride. What they cannot do is cross a gap:
 * the ways nobody has surveyed are drawn — knowing a run is there and unmapped
 * is a fact worth holding — but they refuse to be travelled, and the place
 * beyond them cannot be reached at all. That is what an open registry is: the
 * holes are visible, and filling them is an invitation rather than an error.
 */
export default function MountainRoom({ room }: { room: Room }) {
  const camera = useThree((state) => state.camera)
  const registry = useMemo(() => resort(), [])

  const journey = useRef(startAt(ARRIVAL_PLACE))
  /** The chosen link's name, mirrored into React so the highlight can re-render. */
  const [chosen, setChosen] = useState<string | null>(null)
  /**
   * How far the viewer has turned their head off the heading the graph gives.
   *
   * Starts tilted down a little. The view is aimed along whatever link is
   * chosen, and from the base that is a lift going up the hill — which frames
   * the mountain beautifully and leaves the board at the bottom of it out of
   * shot entirely.
   */
  const looking = useRef({ yaw: 0, pitch: ARRIVAL_TILT })

  /** The heading the camera is easing towards, held across frames. */
  const aim = useMemo(() => new Vector3(), [])
  const eased = useRef<Vector3 | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'arrowleft' || key === 'a') journey.current = look(registry, journey.current, -1)
      if (key === 'arrowright' || key === 'd') journey.current = look(registry, journey.current, 1)
      if (key === 'arrowup' || key === 'w' || key === 'enter' || key === ' ') {
        journey.current = depart(registry, journey.current)
      }
    }

    let last: { x: number; y: number } | null = null
    const down = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY }
    }
    const move = (event: PointerEvent) => {
      if (!last) return
      const turned = lookFrom(event.clientX - last.x, event.clientY - last.y)
      last = { x: event.clientX, y: event.clientY }
      looking.current = {
        yaw: looking.current.yaw + turned.turned,
        // Clamped well short of straight up: the view here is aimed along the
        // graph, and a gaze that reached the pole would have nothing left to
        // decide which way round the picture sits.
        pitch: Math.max(-1.1, Math.min(1.1, looking.current.pitch + turned.tilted)),
      }
    }
    const up = () => {
      last = null
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [registry])

  useFrame((_state, delta) => {
    journey.current = advance(registry, journey.current, delta)

    const feet = positionOf(registry, journey.current)
    camera.position.set(feet.x, feet.y + EYE_HEIGHT, feet.z)
    camera.up.set(0, 1, 0)

    // Where the graph says to look, eased rather than snapped: stepping round
    // the choices at a junction would otherwise cut the view from one line to
    // the next, and a cut reads as a fault rather than as turning your head.
    aim.copy(focusOf(registry, journey.current)).sub(camera.position).normalize()
    if (!eased.current) eased.current = aim.clone()
    eased.current.lerp(aim, Math.min(1, EASE * delta)).normalize()

    const heading = eased.current.clone()
    heading.applyAxisAngle(UP, looking.current.yaw)
    const right = new Vector3().crossVectors(heading, UP).normalize()
    heading.applyAxisAngle(right, looking.current.pitch)

    camera.lookAt(
      camera.position.x + heading.x,
      camera.position.y + heading.y,
      camera.position.z + heading.z,
    )

    const pointing = pointedAt(registry, journey.current)?.name ?? null
    if (pointing !== chosen) setChosen(pointing)
  })

  /**
   * The places no travellable link reaches.
   *
   * Worked out by walking the graph rather than by asking what leaves each
   * place — a dead end you can ride up to is perfectly reachable, and the
   * webcam at the mid station is exactly that.
   */
  const strandedIds = useMemo(
    () => new Set(unreachable(registry, ARRIVAL_PLACE).map((place) => place.id)),
    [registry],
  )

  const contours = useMemo(() => contourRings(registry), [registry])
  useEffect(() => () => contours.dispose(), [contours])

  const masts = useMemo(() => {
    const flat = registry.places.flatMap((place) => mastOf(registry, place.id, MAST_DROP))
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(flat, 3))
    return geometry
  }, [registry])
  useEffect(() => () => masts.dispose(), [masts])

  return (
    <group>
      <ambientLight intensity={1.4} />
      <pointLight position={[6, 18, 10]} intensity={120} distance={60} decay={1.4} />

      <lineSegments geometry={contours}>
        <lineBasicMaterial color={CONTOUR_COLOUR} transparent opacity={0.55} toneMapped={false} />
      </lineSegments>

      <lineSegments geometry={masts}>
        <lineBasicMaterial color={CONTOUR_COLOUR} transparent opacity={0.8} toneMapped={false} />
      </lineSegments>

      {registry.links.map((link) => (
        <LinkLine
          key={`${link.from}-${link.to}`}
          registry={registry}
          link={link}
          chosen={link.name === chosen}
        />
      ))}

      {registry.places.map((place) => (
        <Marker
          key={place.id}
          registry={registry}
          place={place.id}
          reachable={!strandedIds.has(place.id)}
        />
      ))}

      <TrailBoard registry={registry} room={room} chosen={chosen} />
    </group>
  )
}

const UP = new Vector3(0, 1, 0)

/** One lift, run or gap, drawn as what it is. */
function LinkLine({ registry, link, chosen }: { registry: Resort; link: Link; chosen: boolean }) {
  const geometry = useMemo(() => {
    if (link.kind === 'lift') return new TubeGeometry(curveOf(registry, link), 40, LIFT_RADIUS, 6)
    if (link.kind === 'slope') return slopeRibbon(registry, link, SLOPE_WIDTH)

    const dashed = new BufferGeometry()
    dashed.setAttribute('position', new Float32BufferAttribute(segmentsOf(registry, link), 3))
    return dashed
  }, [registry, link])
  useEffect(() => () => geometry.dispose(), [geometry])

  /**
   * Dashes are spaced along a distance nothing works out on its own, and it is
   * the line object that knows how — not the geometry. Without it the dashed
   * material draws solid, and a gap in the registry looks exactly like a
   * surveyed run.
   */
  const dashes = useRef<LineSegments>(null)
  useLayoutEffect(() => {
    dashes.current?.computeLineDistances()
  }, [geometry])

  const colour = useMemo(() => {
    const base = link.kind === 'lift' ? LIFT_COLOUR : link.kind === 'slope' ? SLOPE_COLOUR : GAP_COLOUR
    return new Color(chosen ? CHOSEN_COLOUR : base)
  }, [link.kind, chosen])

  if (link.kind === 'unsurveyed') {
    return (
      <lineSegments ref={dashes} geometry={geometry}>
        {/* Thin, dim and dashed: a way somebody believes is there, drawn with
            exactly as much confidence as the registry has in it. */}
        <lineDashedMaterial
          color={colour}
          dashSize={0.5}
          gapSize={0.55}
          transparent
          opacity={chosen ? 0.95 : 0.5}
          toneMapped={false}
        />
      </lineSegments>
    )
  }

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={colour}
        emissive={colour}
        emissiveIntensity={chosen ? 0.55 : 0.16}
        roughness={0.6}
        side={link.kind === 'slope' ? DoubleSide : undefined}
        // Runs are see-through. Standing at the bottom of one you are looking
        // straight along a ribbon of ground, and an opaque one fills the frame
        // with itself and hides the mountain it is part of.
        transparent={link.kind === 'slope'}
        opacity={link.kind === 'slope' ? (chosen ? 0.6 : 0.22) : 1}
        toneMapped={false}
      />
    </mesh>
  )
}

/** A place in the registry, and its name. */
function Marker({
  registry,
  place,
  reachable,
}: {
  registry: Resort
  place: string
  reachable: boolean
}) {
  const entry = requirePlace(registry, place)
  const size = PLACE_SIZE[entry.kind]

  return (
    <group position={entry.at}>
      <mesh>
        <octahedronGeometry args={[size]} />
        <meshStandardMaterial
          color={reachable ? '#8ce0c0' : GAP_COLOUR}
          emissive={reachable ? '#8ce0c0' : GAP_COLOUR}
          emissiveIntensity={0.4}
          roughness={0.5}
          toneMapped={false}
        />
      </mesh>
      <CanvasText
        position={[0, size + 0.3, 0]}
        fontSize={0.22}
        maxWidth={4}
        anchorX="center"
        color={reachable ? '#dfe6ee' : '#a292b8'}
        outlineWidth={0.02}
        outlineColor="#0b1016"
      >
        {entry.name}
      </CanvasText>
    </group>
  )
}

/**
 * The board at the bottom of the hill.
 *
 * Every resort has one, and this is the one place in the room where a panel of
 * writing is not an intrusion: a trail map at the base is furniture, not an
 * interface. It carries what the project is, and the line telling the viewer
 * what they are currently pointed at — which is the only piece of state in the
 * room that is not already visible in the view.
 */
function TrailBoard({
  registry,
  room,
  chosen,
}: {
  registry: Resort
  room: Room
  chosen: string | null
}) {
  const base = requirePlace(registry, ARRIVAL_PLACE).at

  return (
    // Low and just under the line up the hill, turned to face the arriving
    // viewer. A trail map at the bottom of the lift is furniture rather than an
    // interface, which is the one place in this room a panel of writing belongs.
    <group position={[base.x - 1.3, base.y + 1.5, base.z - 5.6]} rotation={[0, 0.2, 0]}>
      <mesh>
        <planeGeometry args={[3.7, 1.95]} />
        <meshBasicMaterial color="#0d1319" transparent opacity={0.9} toneMapped={false} />
      </mesh>

      <CanvasText position={[0, 0.62, 0.01]} fontSize={0.27} anchorX="center" color="#ffffff">
        {room.title}
      </CanvasText>

      <CanvasText
        position={[0, 0.4, 0.01]}
        fontSize={0.104}
        maxWidth={3.2}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#aab1c0"
      >
        {room.blurb}
      </CanvasText>

      <group position={[0, -0.42, 0.01]} scale={1.15}>
        {room.links.map((link, index) => (
          <LinkButton
            key={link.href}
            link={link}
            position={[(index - (room.links.length - 1) / 2) * 1.0, 0, 0]}
          />
        ))}
      </group>

      <CanvasText position={[0, -0.68, 0.01]} fontSize={0.085} anchorX="center" color="#8ce0c0">
        {chosen ? `→ ${chosen}` : 'nowhere from here'}
      </CanvasText>

      <CanvasText position={[0, -0.84, 0.01]} fontSize={0.075} anchorX="center" color="#767e91">
        left and right to choose · up to go · drag to look
      </CanvasText>
    </group>
  )
}
