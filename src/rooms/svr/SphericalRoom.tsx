import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BackSide, Box3, Mesh, Vector3, type BufferGeometry, type Group } from 'three'
import type { Room } from '../../content/registry'
import { Boundary } from '../../lib/Boundary'
import { CanvasText } from '../../lib/CanvasText'
import { LinkButton } from '../../lib/LinkButton'
import { shellGeometry } from '../../shape/shapes/svr'
import { eyeAt, facingAt, NORTH_POLE } from './walk'
import { useWalkControls } from './useWalkControls'

const SKULL_MODEL = '/models/skull.glb'

/** The axis a step sideways turns about — see walk.ts. */
const SIDEWAYS = new Vector3(1, 0, 0)

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
 * Standing on the inside means the middle of the sphere is directly overhead,
 * so the object is always above the viewer and the camera always looks straight
 * up the body axis at it. Walking does not move a camera around a subject — it
 * rotates the viewer's whole frame across the surface, carrying which way is up
 * along with it. Half a turn later they are upside down relative to where they
 * started, and nothing has gone wrong.
 */
export default function SphericalRoom({ room }: { room: Room }) {
  const camera = useThree((state) => state.camera)
  const { stance, advance } = useWalkControls()

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

    camera.position.copy(eyeAt(stance.current, SHELL_RADIUS - EYE_HEIGHT))
    // The object is straight overhead, so the view direction is the body axis
    // and some tangent has to decide which way round the picture sits. Looking
    // up, what falls at the top of the frame is what is behind your head — so
    // the reverse of the way you are walking. Which also happens to be the
    // choice that has the room arrive the right way up.
    camera.up.copy(facingAt(stance.current)).negate()
    camera.lookAt(0, 0, 0)
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
 * How far round the shell from the far wall's centre the writing sits.
 *
 * Straight behind the object is straight behind the object: the viewer looks
 * along the axis the object is on, so text centred on the far wall is exactly
 * what the object covers. Far enough round to clear its silhouette, near enough
 * to still be inside a 50° field of view on arrival.
 */
const WALL_ARC = 0.56

/**
 * What the room is, written on the wall.
 *
 * On the shell rather than on a panel hanging in front of the viewer — the
 * whole point of the room is that it is a place, and a place can have writing
 * on it. Positioned so the viewer arrives looking at the object with the words
 * below it, and once they walk away it stays where it is, because it is part of
 * the room rather than part of the interface.
 */
function WallText({ room }: { room: Room }) {
  const wall = useRef<Group>(null)

  // Placed and aimed rather than rotated by hand. Object3D.lookAt turns +Z —
  // which is the way text faces — towards the target, and takes its roll from
  // `up`, so this is upright from the stance the room opens on. Composing the
  // same thing out of Euler angles is where a wall of text ends up mirrored,
  // because facing *away* from the viewer still looks like facing them.
  useLayoutEffect(() => {
    if (!wall.current) return
    wall.current.position.copy(NORTH_POLE).multiplyScalar(-(SHELL_RADIUS - 0.15))
    wall.current.position.applyAxisAngle(SIDEWAYS, -WALL_ARC)
    wall.current.up.set(0, 1, 0)
    wall.current.lookAt(0, 0, 0)
  }, [])

  const links = room.links

  return (
    <group ref={wall}>
      <CanvasText position={[0, 1.1, 0]} fontSize={0.62} anchorX="center" color="#ffffff">
        {room.title}
      </CanvasText>

      <CanvasText
        position={[0, 0.55, 0]}
        fontSize={0.24}
        maxWidth={7}
        lineHeight={1.5}
        anchorX="center"
        anchorY="top"
        color="#aab1c0"
      >
        {room.blurb}
      </CanvasText>

      <group position={[0, -1.35, 0]} scale={2.2}>
        {links.map((link, index) => (
          <LinkButton
            key={link.href}
            link={link}
            position={[(index - (links.length - 1) / 2) * 0.95, 0, 0]}
          />
        ))}
      </group>
    </group>
  )
}
