import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BackSide, Box3, Mesh, Vector3, type BufferGeometry, type Group } from 'three'
import type { Room } from '../../content/registry'
import { Boundary } from '../../lib/Boundary'
import { CanvasText } from '../../lib/CanvasText'
import { LinkButton } from '../../lib/LinkButton'
import { shellGeometry } from '../../shape/shapes/svr'
import { gazeAt, headUpAt } from './gaze'
import { eyeAt, initialStance, upAt, walk } from './walk'
import { useFirstPerson } from './useFirstPerson'

const SKULL_MODEL = '/models/skull.glb'

/** How big the room is, from the middle to the surface you stand on. */
const SHELL_RADIUS = 9
/** How far the viewer's eyes are from that surface, towards the centre. */
const EYE_HEIGHT = 1.65
/**
 * Subdivisions of the icosahedron the shell is built from. Three is the point
 * where the triangles stop reading as facets of a solid and start reading as a
 * tessellation you are standing inside.
 */
const SHELL_DETAIL = 3
/** How tall the object at the centre stands. */
const OBJECT_HEIGHT = 3.9

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

  const shell = useMemo(() => shellGeometry(SHELL_RADIUS, SHELL_DETAIL), [])
  useEffect(() => () => shell.dispose(), [shell])

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
  })

  return (
    <group>
      {/* Unlit, like everything else here: the shapes are drawn as line and
          wash rather than as surfaces catching light, and a lit shell would
          have a bright side and a dark side that fought the walking. */}
      <ambientLight intensity={1} />

      <mesh geometry={shell} frustumCulled={false}>
        {/* BackSide: the viewer is inside it, so the faces pointing at them are
            the far ones. Front-side culling would leave the room invisible. */}
        <meshBasicMaterial
          color={room.accent}
          side={BackSide}
          transparent
          opacity={0.05}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={shell} frustumCulled={false}>
        <meshBasicMaterial
          color={room.accent}
          side={BackSide}
          wireframe
          transparent
          opacity={0.4}
          toneMapped={false}
        />
      </mesh>

      {/* A model that never arrives costs the object, not the room. */}
      <Boundary>
        <CentrepieceModel accent={room.accent} />
      </Boundary>

      <WallText room={room} />
    </group>
  )
}

useGLTF.preload(SKULL_MODEL)

/**
 * The object the room is built around, drawn in the site's own language rather
 * than its own.
 *
 * A faint fill under a wireframe, like every other shape here. That is also why
 * the asset is 159 kB instead of 8.9 MB: with no surface finish to show, its
 * textures, tangents and texture coordinates were all weight paying for
 * nothing, and the mesh could come down to where its wireframe is a legible
 * lattice rather than a grey smear.
 */
function CentrepieceModel({ accent }: { accent: string }) {
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
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={0.12}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={geometry}>
          <meshBasicMaterial color={accent} wireframe transparent opacity={0.5} toneMapped={false} />
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

/** How much of the shell's thickness the writing floats clear of it. */
const WALL_CLEARANCE = 0.15

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
