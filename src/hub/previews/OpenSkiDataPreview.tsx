import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'

const NODE_COUNT = 12

/** The registry as what it actually is: a graph of places, lifts and runs. */
export function OpenSkiDataPreview({ selected }: { selected: boolean }) {
  const nodes = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])

  // Deterministic Fibonacci-sphere placement — stable across renders.
  const placements = useMemo(
    () =>
      Array.from({ length: NODE_COUNT }, (_, index) => {
        const phi = Math.acos(1 - (2 * (index + 0.5)) / NODE_COUNT)
        const theta = Math.PI * (1 + Math.sqrt(5)) * index
        return [
          Math.sin(phi) * Math.cos(theta) * 0.45,
          Math.sin(phi) * Math.sin(theta) * 0.45,
          Math.cos(phi) * 0.45,
        ] as const
      }),
    [],
  )

  useFrame((state) => {
    if (!nodes.current) return
    placements.forEach((position, index) => {
      const pulse = selected ? 1 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.25 : 1
      dummy.position.set(position[0], position[1], position[2])
      dummy.scale.setScalar(pulse)
      dummy.updateMatrix()
      nodes.current!.setMatrixAt(index, dummy.matrix)
    })
    nodes.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* One draw call for all twelve nodes. */}
      <instancedMesh ref={nodes} args={[undefined, undefined, NODE_COUNT]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#8ce0c0'} roughness={0.4} />
      </instancedMesh>
      {/* One more for the shell they sit on. */}
      <mesh>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshBasicMaterial color={selected ? '#5f7f74' : '#2c4b41'} wireframe toneMapped={false} />
      </mesh>
    </group>
  )
}
