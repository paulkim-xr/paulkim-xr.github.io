import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide, FrontSide, type Mesh, type MeshBasicMaterial } from 'three'
import type { Direction, Phase } from './machine'
import { usePhaseProgress } from './usePhaseClock'
import { whiteoutAt } from './whiteout'

/** Below this the sheet is a draw call painting nothing. */
const EPSILON = 0.004
const XR_SPHERE_RADIUS = 8

type WhiteSheetProps = {
  phase: Phase
  direction: Direction
  /** Flat scales a plane to fill the frustum; XR closes a sphere around the rig. */
  mode: 'flat' | 'xr'
  onMaskComplete: () => void
  onRevealComplete: () => void
}

/**
 * The white the transition passes through, and the clock the machine runs on.
 *
 * The shape swelling into the camera is what the viewer reads as the door, but
 * a wireframe with an open surface cannot actually seal a view — you would see
 * the room in the gaps between its wires. This sheet is what guarantees the
 * cover. It arrives late enough that the shape is already off every edge of the
 * frame, so it is never what you notice.
 *
 * It also owns the phase timer, because it is the one thing on screen through
 * every phase of the transition: the hub is unmounted the moment the camera
 * moves to room framing, and a component that is not mounted cannot report that
 * its beat has finished.
 */
export function WhiteSheet({
  phase,
  direction,
  mode,
  onMaskComplete,
  onRevealComplete,
}: WhiteSheetProps) {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)
  const progressNow = usePhaseProgress(phase, direction)

  /**
   * The beat this component has already reported finished.
   *
   * Without it the callback fires every frame from the end of a phase until
   * React has committed the next one. Recorded as the beat itself rather than
   * cleared by an effect, for the same reason the clock resets in the frame
   * loop: an effect would not have run yet on the frames that matter.
   */
  const reportedPhase = useRef<Phase | null>(null)
  const reportedDirection = useRef<Direction | null>(null)

  useFrame(() => {
    if (!mesh.current) return

    const progress = progressNow()
    const { sheet } = whiteoutAt(phase, direction, progress)

    const material = mesh.current.material as MeshBasicMaterial
    material.opacity = sheet
    mesh.current.visible = sheet > EPSILON

    if (mode === 'xr') {
      // A world-scaled plane cannot fill a headset's view without clipping
      // through the viewer's face. An inverted sphere parented to the camera
      // closes in from all sides instead — the standard comfortable fade.
      mesh.current.position.copy(camera.position)
      mesh.current.scale.setScalar(Math.max(1 - sheet * 0.98, 0.02))
    } else {
      mesh.current.position.copy(camera.position)
      mesh.current.quaternion.copy(camera.quaternion)
      mesh.current.translateZ(-0.5)
    }

    if (progress < 1) return
    if (reportedPhase.current === phase && reportedDirection.current === direction) return
    if (phase !== 'masking' && phase !== 'revealing') return

    reportedPhase.current = phase
    reportedDirection.current = direction
    if (phase === 'masking') onMaskComplete()
    else onRevealComplete()
  })

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false} visible={false}>
      {mode === 'xr' ? (
        <sphereGeometry args={[XR_SPHERE_RADIUS, 24, 16]} />
      ) : (
        <planeGeometry args={[100, 100]} />
      )}
      {/* Shadeless and solid, and drawn over everything regardless of depth:
          the point of it is to be the only thing there. */}
      <meshBasicMaterial
        color="#ffffff"
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
