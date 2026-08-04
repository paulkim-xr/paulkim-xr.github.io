export function PapercupPreview({ selected }: { selected: boolean }) {
  return (
    <mesh>
      <cylinderGeometry args={[0.45, 0.28, 0.7, 24, 1, true]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#9aa4b2'} roughness={0.6} side={2} />
    </mesh>
  )
}
