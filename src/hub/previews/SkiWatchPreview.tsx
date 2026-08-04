export function SkiWatchPreview({ selected }: { selected: boolean }) {
  const colour = selected ? '#ffffff' : '#7fb8ff'

  return (
    <group>
      {/* The mountain. */}
      <mesh position={[0, -0.15, 0]}>
        <coneGeometry args={[0.5, 0.6, 4]} />
        <meshStandardMaterial color={colour} flatShading roughness={0.6} />
      </mesh>
      {/* The camera watching it. */}
      <mesh position={[0.3, 0.4, 0.1]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.2, 0.14, 0.14]} />
        <meshStandardMaterial color={selected ? '#ffffff' : '#4d6f9c'} roughness={0.4} />
      </mesh>
      <mesh position={[0.19, 0.4, 0.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
        <meshStandardMaterial color="#101018" roughness={0.3} />
      </mesh>
    </group>
  )
}
