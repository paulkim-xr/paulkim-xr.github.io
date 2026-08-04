import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, EdgesGeometry, Object3D, Vector3, type InstancedMesh } from 'three'
import { step, type Body, type NBodyOptions } from './nbody'

const BOUNDS = 3.4
const COUNT = 9

const OPTIONS: NBodyOptions = {
  strength: 5.5,
  bounds: BOUNDS,
  restitution: 0.86,
  softening: 0.45,
}

/** Faces of the box, in the original's six colours. */
const WALLS: { colour: string; position: [number, number, number]; rotation: [number, number, number] }[] = [
  { colour: '#ff4d4d', position: [BOUNDS, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { colour: '#4dff88', position: [0, BOUNDS, 0], rotation: [Math.PI / 2, 0, 0] },
  { colour: '#4d8cff', position: [0, 0, BOUNDS], rotation: [Math.PI, 0, 0] },
  { colour: '#ffe14d', position: [-BOUNDS, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { colour: '#4de1ff', position: [0, -BOUNDS, 0], rotation: [-Math.PI / 2, 0, 0] },
  { colour: '#ff4de1', position: [0, 0, -BOUNDS], rotation: [0, 0, 0] },
]

/**
 * Deterministic starting state.
 *
 * The original randomised positions, masses and the opening kick, so no two
 * loads and no two bug reports were ever about the same simulation. Fixed
 * seeding costs nothing and makes the thing reproducible.
 */
function initialBodies(): Body[] {
  return Array.from({ length: COUNT }, (_, index) => {
    const golden = Math.PI * (1 + Math.sqrt(5))
    const inclination = Math.acos(1 - (2 * (index + 0.5)) / COUNT)
    const azimuth = golden * index
    const radius = BOUNDS * 0.62
    const mass = 0.7 + (index % 3) * 0.5

    return {
      position: new Vector3(
        Math.sin(inclination) * Math.cos(azimuth) * radius,
        Math.sin(inclination) * Math.sin(azimuth) * radius,
        Math.cos(inclination) * radius,
      ),
      // Tangential, so the cloud starts by swirling rather than collapsing
      // straight through its own centre.
      velocity: new Vector3(-Math.sin(azimuth), Math.cos(azimuth), Math.sin(inclination) * 0.3)
        .multiplyScalar(1.15),
      mass,
      radius: 0.16 + mass * 0.12,
    }
  })
}

/**
 * Gravity, from the earlier three.js pages.
 *
 * Bodies attracting each other by an inverse square law inside a closed
 * coloured box. The original drove this with @react-three/cannon and pushed
 * every body's position through React state on every frame, re-rendering the
 * whole tree 60 times a second; the integrator here is a few dozen lines, has
 * no dependency, and is tested.
 */
export function GravityScene() {
  const mesh = useRef<InstancedMesh>(null)
  const bodies = useMemo(initialBodies, [])
  const placement = useMemo(() => new Object3D(), [])

  // EdgesGeometry rather than a wireframe material: wireframe draws every
  // triangle, so a box comes out with a diagonal across each face.
  const boxEdges = useMemo(
    () => new EdgesGeometry(new BoxGeometry(BOUNDS * 2, BOUNDS * 2, BOUNDS * 2)),
    [],
  )
  useEffect(() => () => boxEdges.dispose(), [boxEdges])

  const colours = useMemo(
    () => bodies.map((_, index) => new Color().setHSL((index / bodies.length) * 0.7, 0.6, 0.6)),
    [bodies],
  )

  useFrame((_state, delta) => {
    step(bodies, delta, OPTIONS)
    if (!mesh.current) return

    bodies.forEach((body, index) => {
      placement.position.copy(body.position)
      placement.scale.setScalar(body.radius)
      placement.updateMatrix()
      mesh.current!.setMatrixAt(index, placement.matrix)
      mesh.current!.setColorAt(index, colours[index])
    })

    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={12} distance={BOUNDS * 3} />

      {/* One draw call for every body. */}
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial roughness={0.35} metalness={0.1} />
      </instancedMesh>

      {/* The box, seen from inside: back faces only, so the near wall never
          stands between the camera and the simulation. */}
      {WALLS.map((wall) => (
        <mesh key={wall.colour} position={wall.position} rotation={wall.rotation}>
          <planeGeometry args={[BOUNDS * 2, BOUNDS * 2]} />
          <meshBasicMaterial color={wall.colour} transparent opacity={0.09} toneMapped={false} />
        </mesh>
      ))}

      {/* Edges, so the box reads as a box rather than as coloured fog. */}
      <lineSegments geometry={boxEdges}>
        <lineBasicMaterial color="#49526a" toneMapped={false} />
      </lineSegments>
    </group>
  )
}
