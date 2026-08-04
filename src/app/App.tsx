import { Canvas } from '@react-three/fiber'

export function App() {
  return (
    <Canvas camera={{ position: [0, 1.6, 6], fov: 55 }}>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.6} />
      <mesh>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
        <meshStandardMaterial color="#8888ff" />
      </mesh>
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
    </Canvas>
  )
}
