import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  type BufferGeometry,
  type PointLight,
} from 'three'
import type { Room } from '../../content/registry'
import { CanvasText } from '../../lib/CanvasText'
import { LinkButton } from '../../lib/LinkButton'
import { corridorGeometry } from './corridor'
import type { Bounds } from './stroll'
import { corridorDomain } from '../../space/domains/corridor'
import { keysTechnique } from '../../space/techniques/keys'
import { pointerTechnique } from '../../space/techniques/pointer'
import { useNavigation } from '../../space/useNavigation'
import { Rig } from '../../space/Rig'
import {
  AMPLITUDE,
  crossingTime,
  displacementAt,
  headAt,
  stillTravelling,
  type Pulse,
} from './wave'

/** Half the room, along the string and across it: where the walls are. */
const ROOM: Bounds = { alongString: 9, acrossString: 2.8 }

/**
 * How close the viewer may get to a wall.
 *
 * A person cannot stand with their eye in the plaster. Allowed all the way to
 * the wall itself, the camera ends up exactly on it — where the near plane
 * clips it away and the viewer finds themselves looking out of a sealed room
 * into nothing, which is both wrong and the opposite of what this room is for.
 */
const REACH = 0.8
const WALKABLE: Bounds = {
  alongString: ROOM.alongString - REACH,
  acrossString: ROOM.acrossString - REACH,
}
const HEIGHT = 5

/** How high the string is strung, and how high the viewer's eyes are. */
const STRING_Y = 1.78
const EYE_HEIGHT = 1.62

/** How long the string is: cup to cup, a little inside the end walls. */
const SPAN = (ROOM.alongString - 0.9) * 2

/** How finely the string is cut up, so a pulse passing along it reads as smooth. */
const STRING_SEGMENTS = 220
const STRING_RADIUS = 0.032

/**
 * Where the room opens.
 *
 * Near one cup and a little to one side of the string, turned a few degrees off
 * straight. That puts the far cup dead ahead with the whole length of string
 * running away towards it — which is the room in one look — and brings the
 * board on the side wall into the edge of the frame rather than leaving it
 * ninety degrees away where nobody would know to turn for it.
 */
const ARRIVAL = { x: -(ROOM.alongString - 2.5), z: 1.2, heading: -0.1 }

/**
 * How high the board hangs on the end wall, above the far cup.
 *
 * On the end wall rather than along a side one, and that took three tries. A
 * board on a side wall is either square on to the viewer — in which case it is
 * ninety degrees from the way they are facing and nobody knows to turn for it —
 * or it is ahead of them, in which case it is read at sixty degrees, which
 * compresses its own text to half width and is simply not legible. Worse, an
 * arrival angled far enough to see it is an arrival where walking forward puts
 * you into a wall within two seconds.
 *
 * Down the room it is square on, it is where the string is already leading the
 * eye, and walking towards it — the room's whole interaction — is what makes it
 * readable. High enough to clear the cup hanging in front of it.
 */
const BOARD_Y = 3.6

/** How long the far end takes to answer, in seconds. */
const THINKING = 0.9
/** How long the room waits before placing a call of its own. */
const IDLE_GAP = 7

/** How much light the room has of its own, before anything travels the string. */
const AMBIENT_INTENSITY = 0.75
const LAMP_INTENSITY = 22
/** Where the ceiling lamps hang along the room. */
const HOUSE_LIGHTS = [-6, -2, 2, 6]

const STRING_AT_REST = new Color('#4a5160')
const STRING_LIT = new Color('#ffd9a8')
const ROOM_COLOUR = '#2f3542'
const CUP_COLOUR = '#cbc6bb'

/**
 * The papercup room: a tin-can telephone at the size of a building.
 *
 * Two cups at either end of a long sealed box, and a string strung between them
 * that passes over the viewer's head. What travels along it is what was said.
 * The room is dark and the pulse is the only real light in it, so a call
 * crossing the space is the thing that lights the walls as it goes — which is
 * the project: a voice line, and the voice is what the whole thing is for.
 *
 * The box is closed at both ends on purpose. papercup runs on hardware you own
 * and no audio leaves your network, so this is a room you cannot walk out of
 * and a string that terminates in your own two cups.
 */
export default function StringRoom({ room }: { room: Room }) {
  const clock = useThree((state) => state.clock)

  const walking = useMemo(() => corridorDomain(WALKABLE, ARRIVAL, EYE_HEIGHT), [])
  const { state: here, advance } = useNavigation(
    walking,
    [keysTechnique, pointerTechnique],
    (intents) => {
      if (intents.act) pickUp(clock.getElapsedTime())
    },
  )

  const walls = useMemo(() => corridorGeometry(ROOM, HEIGHT), [])
  useEffect(() => () => walls.dispose(), [walls])

  /** The string, plus the shape it takes when nothing is travelling down it. */
  const { string, atRest } = useMemo(() => {
    const geometry = new CylinderGeometry(
      STRING_RADIUS,
      STRING_RADIUS,
      SPAN,
      5,
      STRING_SEGMENTS,
      true,
    )
    // Built along Y, like every cylinder; turned to lie along the room.
    geometry.rotateZ(Math.PI / 2)
    const position = geometry.getAttribute('position')
    geometry.setAttribute(
      'color',
      new Float32BufferAttribute(new Float32Array(position.count * 3), 3),
    )
    return { string: geometry, atRest: Float32Array.from(position.array) }
  }, [])
  useEffect(() => () => string.dispose(), [string])

  /**
   * The calls in flight, and when the far end is due to answer.
   *
   * A ref rather than state: they are read and rewritten every frame, and
   * nothing in the tree renders differently for them.
   */
  const calls = useRef<{ pulses: Pulse[]; replyAt: number | null; nextIdle: number }>({
    pulses: [],
    replyAt: null,
    nextIdle: 1.2,
  })

  /** The two lights that ride the pulses. Two, because a call is a round trip. */
  const riders = [useRef<PointLight>(null), useRef<PointLight>(null)]

  /** The light the viewer carries, so the floor they walk has a surface to it. */
  const lamp = useRef<PointLight>(null)

  /**
   * Picking up: send something down the string.
   *
   * Driven by the `act` intent rather than by listeners of the room's own, so
   * the tap that fires it is the same tap the navigation layer has already
   * decided was not a drag and not a walk. The room used to watch the pointer
   * itself and count any press that had not travelled far — which, now that a
   * press held still walks you down the corridor, would have rung the string
   * every time you stopped walking.
   */
  const pickUp = (now: number) => {
    const call = calls.current
    call.pulses = [...call.pulses, { firedAt: now, direction: 1 }]
    call.replyAt = now + crossingTime(SPAN) + THINKING
    call.nextIdle = now + IDLE_GAP
  }

  // The rig advances the walk and puts the camera where it ends up. What is
  // left here is the room's own life: the string, the pulses on it, and the
  // lamp the viewer carries.
  useFrame(() => {
    const now = clock.getElapsedTime()

    const call = calls.current
    call.pulses = stillTravelling(call.pulses, now, SPAN)

    // The far end answering, and — if nobody has picked up in a while — the
    // room placing a call of its own, so that arriving in it shows what it is
    // rather than showing a dark box and waiting to be asked.
    if (call.replyAt !== null && now >= call.replyAt) {
      call.pulses = [...call.pulses, { firedAt: now, direction: -1 }]
      call.replyAt = null
    }
    if (call.pulses.length === 0 && call.replyAt === null && now >= call.nextIdle) {
      call.pulses = [{ firedAt: now, direction: 1 }]
      call.replyAt = now + crossingTime(SPAN) + THINKING
      call.nextIdle = now + IDLE_GAP
    }

    shapeTheString(string, atRest, call.pulses, now)

    riders.forEach((rider, index) => {
      const light = rider.current
      if (!light) return
      const pulse = call.pulses[index]
      light.visible = pulse !== undefined
      if (pulse) light.position.set(headAt(pulse, now, SPAN), STRING_Y, 0)
    })

    lamp.current?.position.copy(walking.poseOf(here.current).position)
  })

  const links = room.links

  return (
    <group>
      <Rig domain={walking} state={here} advance={advance} />

      <ambientLight intensity={AMBIENT_INTENSITY} color="#8a93a8" />
      {/* A lamp at the eye, the same as the sphere room next door and for the
          same reason: a corridor lit evenly end to end is a picture of a
          corridor, and one lit from where the viewer is standing has a floor
          that falls away from them as they walk it. */}
      <pointLight ref={lamp} intensity={LAMP_INTENSITY} distance={15} decay={1.5} color="#cdd6e6" />
      {/* House lights, strung down the ceiling. Dim on purpose: they say the
          room has a shape without ever being the brightest thing in it, which
          is a job reserved for whatever is crossing the string. */}
      {HOUSE_LIGHTS.map((x) => (
        <pointLight
          key={x}
          position={[x, HEIGHT - 0.25, 0]}
          intensity={11}
          distance={9}
          decay={1.6}
          color="#9fb0cc"
        />
      ))}
      {riders.map((rider, index) => (
        <pointLight
          key={index}
          ref={rider}
          intensity={44}
          distance={9.5}
          decay={1.6}
          color="#ffcf94"
        />
      ))}

      <mesh geometry={walls} frustumCulled={false}>
        {/* FrontSide, unlike the sphere next door. That room is a shell built
            facing outwards and seen from within, so the faces towards the
            viewer are its back ones. This box is built facing inwards — every
            wall already points at the room — so culling the back is right and
            culling the front leaves the viewer in an unlit void with a string
            hanging in it. */}
        <meshStandardMaterial
          color={ROOM_COLOUR}
          side={FrontSide}
          roughness={0.94}
          metalness={0.03}
          flatShading
          vertexColors
        />
      </mesh>

      <mesh geometry={string} position={[0, STRING_Y, 0]} frustumCulled={false}>
        {/* Self-lit rather than lit: the string is what is carrying the light,
            so its brightness comes from the pulse on it and not from the room. */}
        <meshBasicMaterial vertexColors toneMapped={false} />
      </mesh>

      <Cup at={-(ROOM.alongString - 0.45)} facing={-1} />
      <Cup at={ROOM.alongString - 0.45} facing={1} />

      <group
        position={[ROOM.alongString - 0.06, BOARD_Y, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <mesh>
          <planeGeometry args={[5.2, 2.45]} />
          <meshBasicMaterial color="#12151d" transparent opacity={0.85} toneMapped={false} />
        </mesh>

        <CanvasText position={[0, 0.82, 0.01]} fontSize={0.4} anchorX="center" color="#ffffff">
          {room.title}
        </CanvasText>

        <CanvasText
          position={[0, 0.5, 0.01]}
          fontSize={0.145}
          maxWidth={4.4}
          lineHeight={1.5}
          anchorX="center"
          anchorY="top"
          color="#aab1c0"
        >
          {room.blurb}
        </CanvasText>

        <group position={[0, -0.63, 0.01]} scale={1.5}>
          {links.map((link, index) => (
            <LinkButton
              key={link.href}
              link={link}
              position={[(index - (links.length - 1) / 2) * 1.0, 0, 0]}
            />
          ))}
        </group>

        <CanvasText position={[0, -0.98, 0.01]} fontSize={0.105} anchorX="center" color="#767e91">
          space to pick up · arrows to walk · drag to look
        </CanvasText>
      </group>
    </group>
  )
}

/**
 * Pulls the string into the shape the pulses on it give it, and lights the
 * stretch each one is passing through.
 *
 * Every corner already knows where along the room it is, so the displacement is
 * read straight off its own x rather than from a separate model of the string —
 * there is only ever one answer to where the string is.
 */
function shapeTheString(
  string: BufferGeometry,
  atRest: Float32Array,
  pulses: Pulse[],
  now: number,
): void {
  const position = string.getAttribute('position')
  const colour = string.getAttribute('color')
  const lit = new Color()

  for (let corner = 0; corner < position.count; corner++) {
    const x = atRest[corner * 3]
    const pull = displacementAt(x, pulses, now, SPAN)

    position.setY(corner, atRest[corner * 3 + 1] + pull)
    lit.copy(STRING_AT_REST).lerp(STRING_LIT, Math.min(1, pull / AMPLITUDE))
    colour.setXYZ(corner, lit.r, lit.g, lit.b)
  }

  position.needsUpdate = true
  colour.needsUpdate = true
}

/**
 * One end of the telephone.
 *
 * The mouth faces out at the wall and the base faces in down the string, which
 * is the way a cup on a string actually works — the knot goes through the
 * bottom. Turned the other way it is two funnels drinking from a shared straw.
 */
function Cup({ at, facing }: { at: number; facing: 1 | -1 }) {
  return (
    <mesh position={[at, STRING_Y, 0]} rotation={[0, 0, (-facing * Math.PI) / 2]}>
      <cylinderGeometry args={[0.62, 0.34, 1.05, 28, 1, true]} />
      {/* Open-ended, so both faces of it are seen: the outside from down the
          room, and the inside of the mouth from beyond it. */}
      <meshStandardMaterial color={CUP_COLOUR} side={DoubleSide} roughness={0.85} />
    </mesh>
  )
}

