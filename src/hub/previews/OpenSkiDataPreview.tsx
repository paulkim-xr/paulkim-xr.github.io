export function OpenSkiDataPreview({ selected }: { selected: boolean }) {
  return (
    <mesh>
      <icosahedronGeometry args={[0.5, 1]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#8ce0c0'} wireframe />
    </mesh>
  )
}
