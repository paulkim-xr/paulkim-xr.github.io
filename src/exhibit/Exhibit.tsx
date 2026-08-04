import type { Room } from '../content/registry'

export default function Exhibit({ room }: { room: Room }) {
  return (
    <group>
      <mesh position={[0, 1, -2]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh visible={false} name={`exhibit-${room.id}`} />
    </group>
  )
}
