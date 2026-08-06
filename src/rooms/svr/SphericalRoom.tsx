import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  Box3,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Group,
  type PointLight,
} from 'three'
import type { Room } from '../../content/registry'
import { Boundary } from '../../lib/Boundary'
import { CanvasText } from '../../lib/CanvasText'
import { LinkButton } from '../../lib/LinkButton'
import { shellGeometry } from '../../shape/shapes/svr'
import { gazeAt, headUpAt } from './gaze'
import { tintPanels } from './panels'
import { eyeAt, initialStance, upAt, walk } from './walk'
import { useFirstPerson } from './useFirstPerson'

const SKULL_MODEL = '/models/skull.glb'

/** How big the room is, from the middle to the surface you stand on. */
const SHELL_RADIUS = 9
/** How far the viewer's eyes are from that surface, towards the centre. */
const EYE_HEIGHT = 1.65
/**
 * Subdivisions of the icosahedron the shell is built from.
 *
 * Chosen against the viewer's own size rather than by eye. Three subdivisions
 * gives panels 2.7 units across, and standing 1.65 from the wall a viewer
 * looking at their feet sees a view 1.5 units wide — so a single panel more
 * than filled the frame, and the floor was one flat tone with nothing in it to
 * say how big anything was or that it was a surface at all. Eighteen puts about
 * three panels across that view: enough to read as panelling underfoot, coarse
 * enough to still read as a geodesic shell from across the room.
 *
 * Note this is not a doubling per step — three subdivides each edge into
 * `detail + 1`, so the count grows with the square and eighteen is 7,220 faces
 * rather than the millions the name suggests.
 */
const SHELL_DETAIL = 18
/** How tall the object at the centre stands. */
const OBJECT_HEIGHT = 3.9

/**
 * How bright the light the viewer carries is, and how far it reaches.
 *
 * A lamp at the eye, and it is what makes the shell a floor. Light from the
 * middle of a sphere would be useless here: every point of the inside is the
 * same distance from the centre and square-on to it, so a lamp there lights the
 * whole room to exactly one flat value and the surface disappears. A lamp that
 * travels with the viewer falls off with distance instead, so the facets
 * underfoot are bright, the ones across the room are not, and walking moves
 * that gradient — which is the whole sensation of being on a surface rather
 * than inside a picture of one.
 */
const LAMP_INTENSITY = 34
const LAMP_REACH = 22
/**
 * Softer than the inverse square real light falls off by.
 *
 * True falloff over the 1.6 metres underfoot to the 5 across the room is a
 * factor of ten, which blows out your feet and leaves the far wall black.
 */
const LAMP_DECAY = 1.55

/** Where the light on the object hangs, and how hard. */
const KEY_POSITION: [number, number, number] = [2.1, 2.6, 1.3]
const KEY_INTENSITY = 19
/**
 * Cut off before it can reach the shell.
 *
 * The lamp is nearer the object than the wall is, but not by much, and without
 * a limit it throws a bright patch on the tessellation that reads as a fault in
 * the room rather than as light.
 */
const KEY_REACH = 6.5

/** Enough that nothing in the room is ever pure black. */
const AMBIENT_INTENSITY = 0.38

/**
 * The Spherical Viewing Room: an object at the centre, and a tessellated shell
 * you walk the inside of to see it from every angle.
 *
 * A viewer stands on that inner surface and looks at the horizon, the way a
 * person in a room looks at a room. The object is not in front of them — the
 * middle of the sphere is directly overhead from anywhere on the inside of it,
 * so seeing the thing is something they do, by looking up. Walking does not
 * swing a camera around a subject; it rotates the viewer's whole frame across
 * the surface, carrying which way is up along with it. Half a turn later they
 * are upside down relative to where they started, and nothing has gone wrong.
 */
export default function SphericalRoom({ room }: { room: Room }) {
  const camera = useThree((state) => state.camera)
  const { stance, pitch, advance } = useFirstPerson()

  /** Where the camera is aimed, held across frames rather than allocated in one. */
  const lookingAt = useMemo(() => new Vector3(), [])

  const shell = useMemo(() => {
    const geometry = shellGeometry(SHELL_RADIUS, SHELL_DETAIL)
    // The shell arrives as loose triangles with no normals, so this gives each
    // face its own — which is exactly the flat shading the room wants. Every
    // facet takes one value from the lamp and the tessellation reads as
    // panelling catching light rather than as a drawing of a sphere.
    geometry.computeVertexNormals()
    // A sphere lit from inside has almost no shading to give: neighbouring
    // facets are very nearly parallel and take very nearly the same light, so
    // the floor underfoot came out a flat wash with no scale to it. A tone per
    // panel puts the tessellation back without drawing a line.
    tintPanels(geometry)
    return geometry
  }, [])
  useEffect(() => () => shell.dispose(), [shell])

  /** The lamp the viewer carries, moved to the eye on every frame. */
  const lamp = useRef<PointLight>(null)

  /**
   * Hands the camera back the way it was found.
   *
   * Walking tips `camera.up` away from world up and leaves it wherever the
   * viewer stopped. Every `lookAt` in the app reads that vector, so without
   * this the hub comes back rolled over at whatever angle the room was left
   * at — and stays there, because nothing else ever writes it.
   */
  useEffect(() => {
    return () => {
      camera.up.set(0, 1, 0)
    }
  }, [camera])

  useFrame((_state, delta) => {
    advance(delta)
    const here = stance.current
    const tilt = pitch.current

    camera.position.copy(eyeAt(here, SHELL_RADIUS - EYE_HEIGHT))
    // Aimed a step along the gaze rather than at a fixed point, because there
    // is no fixed point to aim at: where the viewer is looking is a direction
    // they choose, and only one value of it happens to pass through the object.
    camera.up.copy(headUpAt(here, tilt))
    camera.lookAt(lookingAt.copy(camera.position).add(gazeAt(here, tilt)))

    lamp.current?.position.copy(camera.position)
  })

  return (
    <group>
      <ambientLight intensity={AMBIENT_INTENSITY} color={SHELL_COLOUR} />
      <pointLight
        ref={lamp}
        intensity={LAMP_INTENSITY}
        distance={LAMP_REACH}
        decay={LAMP_DECAY}
        color="#e8ecf6"
      />
      <pointLight
        position={KEY_POSITION}
        intensity={KEY_INTENSITY}
        distance={KEY_REACH}
        decay={2}
        color="#fff3e2"
      />

      <mesh geometry={shell} frustumCulled={false}>
        {/* BackSide: the viewer is inside it, so the faces pointing at them are
            the far ones. Front-side culling would leave the room invisible. */}
        <meshStandardMaterial
          color={SHELL_COLOUR}
          side={BackSide}
          roughness={0.92}
          metalness={0.04}
          flatShading
          vertexColors
        />
      </mesh>

      {/* A model that never arrives costs the object, not the room. */}
      <Boundary>
        <CentrepieceModel />
      </Boundary>

      <WallText room={room} />
    </group>
  )
}

/**
 * What the room is made of.
 *
 * Dark and cool against the object's warm bone, because the two have to be told
 * apart at a glance. The whole reason this room stopped being drawn as
 * wireframe is that white lines on a dark ground read as the same substance
 * whatever they are describing — the wall and the thing on show were the same
 * material, and the eye had nothing to separate them by.
 */
const SHELL_COLOUR = '#39404f'
/** What the object is made of: warm, matt, and lighter than its surroundings. */
const OBJECT_COLOUR = '#cdc3ac'

useGLTF.preload(SKULL_MODEL)

/**
 * The object the room is built around, as a solid.
 *
 * Drawn as a lit surface rather than in the wireframe the rest of the site
 * uses, and it had to be: a white lattice hanging inside a white lattice is one
 * substance, and the thing the room exists to show was indistinguishable from
 * the walls it was shown against. Being solid is also what makes walking worth
 * anything — a wireframe reads the same from both sides at once, so going round
 * it changed the picture without ever changing what you could see.
 */
function CentrepieceModel() {
  const { scene } = useGLTF(SKULL_MODEL)

  const { geometry, scale, offset } = useMemo(() => {
    let found: BufferGeometry | null = null
    scene.traverse((object) => {
      if (!found && object instanceof Mesh) found = object.geometry as BufferGeometry
    })
    if (!found) throw new Error(`${SKULL_MODEL} contains no mesh`)

    // The asset arrives at whatever size and origin it was authored at — this
    // one is a quarter of a unit tall and sits on its own floor. Measured and
    // recentred rather than hand-tuned, so replacing the model does not mean
    // hunting for new magic numbers.
    const bounds = new Box3().setFromBufferAttribute(
      (found as BufferGeometry).getAttribute('position') as never,
    )
    const size = bounds.getSize(new Vector3())
    const middle = bounds.getCenter(new Vector3())
    const factor = OBJECT_HEIGHT / Math.max(size.x, size.y, size.z)

    return { geometry: found as BufferGeometry, scale: factor, offset: middle.multiplyScalar(-1) }
  }, [scene])

  return (
    <group scale={scale}>
      <group position={offset}>
        <mesh geometry={geometry}>
          <meshStandardMaterial color={OBJECT_COLOUR} roughness={0.62} metalness={0.02} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * How far ahead along the floor the writing sits, in radians of arc.
 *
 * Expressed as a walk rather than as an axis and an angle, because that is what
 * it is: the writing is a few paces in front of where the viewer arrives. Far
 * enough that the wall it is on has curved up to face them, near enough to be
 * the first thing in the frame.
 */
const WALL_ARC = 0.62

/**
 * How far the writing stands proud of the shell.
 *
 * More than it looks like it should need, for two reasons that only showed up
 * once the wall stopped being a transparent wireframe and became a surface that
 * could swallow things.
 *
 * The facets lie inside the sphere they are cut from, so a sign placed at the
 * nominal radius is behind the wall rather than on it — that was what swallowed
 * the lower half of this block when the shell became solid. And a flat block
 * hung against a wall
 * that curves away pushes its own ends outwards: the sign is turned to face the
 * arriving viewer, which is the only way it is readable at the glancing angle a
 * horizon is seen at, and that tilt walks the bottom of the block out through
 * the shell. It has to stand off far enough that its corners clear too, not
 * just its middle.
 */
const WALL_CLEARANCE = 1.2

/**
 * The board the writing sits on, sized around the block it has to hold.
 *
 * The text runs from the top of the title down to the bottom of the line about
 * the controls; this is that span with room to breathe either side.
 */
const BOARD_WIDTH = 2.86
const BOARD_HEIGHT = 1.58
const BOARD_CENTRE = -0.17

/**
 * What the room is, written on the wall ahead of the viewer.
 *
 * On the shell rather than on a panel hanging in front of them — the whole
 * point of the room is that it is a place, and a place can have writing on it.
 * It is where they are looking when they arrive, and once they walk away it
 * stays where it is, because it is part of the room rather than part of the
 * interface. Which is also why it tells them to look up: nothing else in the
 * frame will, and the object is the reason the room exists.
 */
function WallText({ room }: { room: Room }) {
  const wall = useRef<Group>(null)

  // Placed and aimed rather than rotated by hand. Object3D.lookAt turns +Z —
  // which is the way text faces — towards the target, and takes its roll from
  // `up`, so this is upright and square-on from the stance the room opens on.
  // Composing the same thing out of Euler angles is where a wall of text ends
  // up mirrored, because facing *away* from the viewer still looks like facing
  // them.
  useLayoutEffect(() => {
    if (!wall.current) return
    const arrival = initialStance()
    const ahead = walk(arrival, { forward: WALL_ARC, sideways: 0 })

    wall.current.position.copy(eyeAt(ahead, SHELL_RADIUS - WALL_CLEARANCE))
    wall.current.up.copy(upAt(arrival))
    wall.current.lookAt(eyeAt(arrival, SHELL_RADIUS - EYE_HEIGHT))
  }, [])

  const links = room.links

  // Sized for a wall about five units off, which is where the one in front of a
  // standing viewer is. The old numbers were three times these: they were for
  // the far side of the sphere, sixteen units away through the middle.
  return (
    <group ref={wall}>
      {/* A board to write on, rather than writing on the wall itself. Once the
          shell became a lit surface the text was competing with the facets
          behind it for contrast, and the link — a dark plate on a dark ground —
          had stopped reading as something you could press at all. */}
      <mesh position={[0, BOARD_CENTRE, -0.01]}>
        <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
        <meshBasicMaterial color="#12151d" transparent opacity={0.82} toneMapped={false} />
      </mesh>

      <CanvasText position={[0, 0.36, 0]} fontSize={0.2} anchorX="center" color="#ffffff">
        {room.title}
      </CanvasText>

      <CanvasText
        position={[0, 0.18, 0]}
        fontSize={0.078}
        maxWidth={2.3}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#aab1c0"
      >
        {room.blurb}
      </CanvasText>

      {/* Scaled past what the text alone would want, so the plate stays a real
          touch target on a phone rather than a 30px sliver of one. */}
      <group position={[0, -0.52, 0]} scale={1.4}>
        {links.map((link, index) => (
          <LinkButton
            key={link.href}
            link={link}
            position={[(index - (links.length - 1) / 2) * 0.95, 0, 0]}
          />
        ))}
      </group>

      <CanvasText position={[0, -0.76, 0]} fontSize={0.062} anchorX="center" color="#767e91">
        drag to look around · arrows to walk · look up for the object
      </CanvasText>
    </group>
  )
}
