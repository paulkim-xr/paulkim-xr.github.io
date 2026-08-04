import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, type Mesh } from 'three'

/** The paper cup telephone: speak into one, it emerges from the other. */
export function PapercupPreview({ selected }: { selected: boolean }) {
  const line = useRef<Mesh>(null)
  const colour = selected ? '#ffffff' : '#9aa4b2'

  useFrame((state) => {
    if (!line.current) return
    // A standing wave along the string, only while this item is selected.
    const amplitude = selected ? 0.03 : 0
    line.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 6) * amplitude
  })

  // Cylinder geometry runs along Y, so every part is rotated a quarter turn
  // about Z to lie along X. Rotating the parent group instead would stack the
  // two cups vertically, which is not what a cup telephone looks like.
  return (
    <group>
      {/* Right-hand cup, mouth facing outward. */}
      <mesh position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.15, 0.34, 20, 1, true]} />
        <meshStandardMaterial color={colour} roughness={0.7} side={DoubleSide} />
      </mesh>

      {/* The taut line between them. */}
      <mesh ref={line} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.55, 6]} />
        <meshStandardMaterial color={colour} roughness={0.5} />
      </mesh>

      {/* Left-hand cup, mirrored. */}
      <mesh position={[-0.42, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.15, 0.34, 20, 1, true]} />
        <meshStandardMaterial color={colour} roughness={0.7} side={DoubleSide} />
      </mesh>
    </group>
  )
}
