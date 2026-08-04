export function SkiWatchPreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0, 0, Math.PI]}>
      <coneGeometry args={[0.5, 0.8, 4]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#7fb8ff'} roughness={0.5} />
    </mesh>
  )
}
