export function Plinth() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.6, 0.7, 0.8, 32]} />
        <meshStandardMaterial color="#16161c" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.81, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 32]} />
        <meshStandardMaterial color="#22222c" roughness={0.7} />
      </mesh>
    </group>
  )
}
