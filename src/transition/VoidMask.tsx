import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide, FrontSide, type Mesh, type MeshBasicMaterial } from 'three'
import { damp } from '../lib/damp'
import type { Direction, Phase } from './machine'

const MASK_LAMBDA = 5
/** Below this the mask is treated as fully open; above it, fully closed. */
const EPSILON = 0.01
const XR_SPHERE_RADIUS = 8

type VoidMaskProps = {
  phase: Phase
  direction: Direction
  /** Flat scales a plane to fill the frustum; XR closes a sphere around the rig. */
  mode: 'flat' | 'xr'
  onMaskComplete: () => void
  onRevealComplete: () => void
}

/** How opaque the void should be in each phase. */
function coverageFor(phase: Phase, direction: Direction): number {
  switch (phase) {
    case 'browsing':
      return 0
    case 'focusing':
      return direction === 'in' ? 0.35 : 0
    case 'masking':
      return 1
    case 'swapping':
      return 1
    case 'revealing':
      return 0
    case 'inRoom':
      return 0
  }
}

export function VoidMask({
  phase,
  direction,
  mode,
  onMaskComplete,
  onRevealComplete,
}: VoidMaskProps) {
  const mesh = useRef<Mesh>(null)
  const coverage = useRef(0)
  const camera = useThree((state) => state.camera)

  useFrame((_state, delta) => {
    if (!mesh.current) return

    const goal = coverageFor(phase, direction)
    coverage.current = damp(coverage.current, goal, MASK_LAMBDA, delta)

    const material = mesh.current.material as MeshBasicMaterial
    material.opacity = coverage.current
    mesh.current.visible = coverage.current > EPSILON

    if (mode === 'xr') {
      // A world-scaled plane cannot fill a headset's view without clipping
      // through the viewer's face. An inverted sphere parented to the camera
      // closes in from all sides instead — the standard comfortable fade.
      mesh.current.position.copy(camera.position)
      const scale = 1 - coverage.current * 0.98
      mesh.current.scale.setScalar(Math.max(scale, 0.02))
    } else {
      mesh.current.position.copy(camera.position)
      mesh.current.quaternion.copy(camera.quaternion)
      mesh.current.translateZ(-0.5)
    }

    if (phase === 'masking' && coverage.current > 1 - EPSILON) onMaskComplete()
    if (phase === 'revealing' && coverage.current < EPSILON) onRevealComplete()
  })

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false} visible={false}>
      {mode === 'xr' ? (
        <sphereGeometry args={[XR_SPHERE_RADIUS, 24, 16]} />
      ) : (
        <planeGeometry args={[100, 100]} />
      )}
      {/* Shadeless and solid: the void is a surface, not a lit object. */}
      <meshBasicMaterial
        color="#0b0b10"
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        side={mode === 'xr' ? BackSide : FrontSide}
        fog={false}
      />
    </mesh>
  )
}
