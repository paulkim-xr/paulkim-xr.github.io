import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Vector3, type Mesh } from 'three'

/** The movement path a climber traces between holds. */
export function ProjectBetaPreview({ selected }: { selected: boolean }) {
  const marker = useRef<Mesh>(null)

  const curve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-0.3, -0.45, 0),
        new Vector3(0.2, -0.15, 0.12),
        new Vector3(-0.15, 0.15, -0.1),
        new Vector3(0.28, 0.45, 0),
      ]),
    [],
  )

  useFrame((state) => {
    if (!marker.current) return
    const t = selected ? (state.clock.elapsedTime * 0.25) % 1 : 0.5
    marker.current.position.copy(curve.getPointAt(t))
  })

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 32, 0.012, 6, false]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#ffb27f'} roughness={0.5} />
      </mesh>
      <mesh ref={marker}>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial
          color={selected ? '#ffffff' : '#ff7f50'}
          emissive={selected ? '#ff7f50' : '#000000'}
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh position={[0.28, 0.45, 0]}>
        <dodecahedronGeometry args={[0.11]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#c2734a'} flatShading roughness={0.9} />
      </mesh>
    </group>
  )
}
