import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

/** Two peers, no server: a board on each side and a packet crossing between. */
export function BoardgamePreview({ selected }: { selected: boolean }) {
  const packet = useRef<Mesh>(null)
  const colour = selected ? '#ffffff' : '#c79aff'

  useFrame((state) => {
    if (!packet.current) return
    const t = selected ? Math.sin(state.clock.elapsedTime * 1.6) : 0
    packet.current.position.x = t * 0.34
  })

  return (
    <group rotation={[0.35, 0.4, 0]}>
      <mesh position={[-0.36, 0, 0]}>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh position={[0.36, 0, 0]}>
        <boxGeometry args={[0.42, 0.06, 0.42]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>
      <mesh ref={packet} position={[0, 0.16, 0]}>
        <octahedronGeometry args={[0.07]} />
        <meshStandardMaterial
          color={selected ? '#ffffff' : '#e0c0ff'}
          emissive={selected ? '#8855ff' : '#000000'}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  )
}
