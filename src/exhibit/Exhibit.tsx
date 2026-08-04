import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { Room } from '../content/registry'
import { InfoPanel } from './InfoPanel'
import { Plinth } from './Plinth'

const SPIN_RATE = 0.35

/**
 * The template every project gets as its floor: the project's own preview
 * object on a plinth, its title and blurb on a panel behind it, and its links
 * as selectable targets. Identical furniture every time, by construction.
 */
export default function Exhibit({ room }: { room: Room }) {
  const pedestalObject = useRef<Group>(null)
  const Preview = room.preview

  useFrame((_state, delta) => {
    if (pedestalObject.current) pedestalObject.current.rotation.y += delta * SPIN_RATE
  })

  return (
    <group>
      {/* Baked-feel lighting only. No realtime shadows — they are a Quest 2
          frame-budget killer and this room has nothing to cast onto. */}
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#7f8cff', '#1a1a22', 0.7]} />
      <directionalLight position={[3, 5, 2]} intensity={0.9} castShadow={false} />

      {/* Object low and forward, panel high and behind: from the room camera
          neither occludes the other, and both stay readable while orbiting. */}
      <group position={[0, -1.3, -1.4]}>
        <Plinth />
        <group ref={pedestalObject} position={[0, 1.35, 0]}>
          <Preview selected />
        </group>
      </group>

      <group position={[0, 1.35, -3.4]}>
        <InfoPanel title={room.title} blurb={room.blurb} links={room.links} />
      </group>

      {/* Floor. Also the teleport target once Task 14 wraps it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.4, 0]} name="exhibit-floor">
        <circleGeometry args={[8, 48]} />
        <meshStandardMaterial color="#0d0d13" roughness={1} />
      </mesh>
    </group>
  )
}
