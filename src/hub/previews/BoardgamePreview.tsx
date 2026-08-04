export function BoardgamePreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0.3, 0.3, 0]}>
      <boxGeometry args={[0.7, 0.12, 0.7]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#c79aff'} roughness={0.4} />
    </mesh>
  )
}
