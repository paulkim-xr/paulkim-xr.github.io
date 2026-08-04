import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, type ReactNode } from 'react'
import { Link } from 'react-router'

const LABEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '1.5rem',
  bottom: '1.4rem',
  color: '#8b93a3',
  font: '400 0.85rem/1.6 system-ui, sans-serif',
  pointerEvents: 'none',
}

const LINK_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '1.5rem',
  top: '1.3rem',
  color: '#c7cddb',
  font: '400 0.85rem/1 system-ui, sans-serif',
  textDecoration: 'none',
}

/**
 * Frame shared by the lab pieces.
 *
 * Each gets its own Canvas rather than joining the hub's. They are whole
 * experiences with their own camera, lighting and framing, and threading that
 * through the hub's transition machine would buy nothing but coupling.
 */
export function LabPage({
  title,
  caption,
  camera,
  children,
}: {
  title: string
  caption: string
  camera: [number, number, number]
  children: ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#07070b' }}>
      <Canvas camera={{ position: camera, fov: 50 }} data-testid="lab-canvas">
        <color attach="background" args={['#07070b']} />
        <Suspense fallback={null}>{children}</Suspense>
        <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} />
      </Canvas>

      <Link to="/" style={LINK_STYLE}>
        ← back
      </Link>
      <div style={LABEL_STYLE}>
        <strong style={{ color: '#e8ecf4', fontWeight: 500 }}>{title}</strong>
        <br />
        {caption}
      </div>
    </div>
  )
}
