export function ProjectBetaPreview({ selected }: { selected: boolean }) {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <dodecahedronGeometry args={[0.5]} />
      <meshStandardMaterial color={selected ? '#ffffff' : '#ffb27f'} flatShading roughness={0.7} />
    </mesh>
  )
}
