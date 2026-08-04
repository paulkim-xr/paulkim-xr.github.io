import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { getRoom, rooms } from '../content/registry'
import { MorphHub } from '../hub/MorphHub'
import { SceneGate } from '../transition/SceneGate'
import { VoidMask } from '../transition/VoidMask'
import { isLocked, shouldMountScene, usesRoomFraming } from '../transition/machine'
import type { Transition } from '../transition/useTransition'

/** Close enough that one shape a metre across fills the frame, with the
 *  title legible below it. */
const HUB_CAMERA = [0, 0.15, 3.3] as const
const HUB_TARGET = [0, -0.3, 0] as const
/** Close enough to read a panel two metres away. */
const ROOM_CAMERA = [0, 0.75, 2.6] as const
const ROOM_TARGET = [0, 0.4, -2] as const

/**
 * Moves the camera between hub and room framing. Both jumps land while the
 * void is fully closed, so there is nothing to animate and nothing to see.
 * In XR the headset owns the camera and this must not touch it.
 */
function CameraRig({ roomFraming, enabled }: { roomFraming: boolean; enabled: boolean }) {
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    if (!enabled) return
    const [px, py, pz] = roomFraming ? ROOM_CAMERA : HUB_CAMERA
    const [tx, ty, tz] = roomFraming ? ROOM_TARGET : HUB_TARGET
    camera.position.set(px, py, pz)
    camera.lookAt(tx, ty, tz)
  }, [roomFraming, enabled, camera])

  return null
}

type StageProps = {
  activeIndex: number
  transition: Transition
  onStep: (delta: number) => void
  xrMode: boolean
}

export function Stage({ activeIndex, transition, onStep, xrMode }: StageProps) {
  const { state } = transition
  const room = state.target ? getRoom(state.target) : undefined
  const Scene = room?.scene

  /**
   * The hub is visible exactly while the camera is in hub framing.
   *
   * Not `phase !== 'inRoom'`: that also draws the hub through `revealing`,
   * when the mask is opening on a room the camera is already pointed at, so
   * the hub would sit in the middle of the room it just handed over to.
   */
  const showHub = !usesRoomFraming(state)

  return (
    <>
      <color attach="background" args={['#08080c']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow={false} />

      <CameraRig roomFraming={usesRoomFraming(state)} enabled={!xrMode} />

      {showHub && (
        <MorphHub
          rooms={rooms}
          activeIndex={activeIndex}
          onStep={onStep}
          onSelect={transition.select}
          dimmed={isLocked(state)}
        />
      )}

      {/* Flat room navigation is orbit, per the spec's parity table. It exists
          only inside a room — orbiting the hub would fight the carousel — and
          never in XR, where the headset owns the camera. */}
      {!xrMode && state.phase === 'inRoom' && (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2}
          target={ROOM_TARGET}
        />
      )}

      {Scene && room && shouldMountScene(state) && (
        <Suspense fallback={null}>
          <SceneGate onReady={transition.sceneReady}>
            <Scene room={room} />
          </SceneGate>
        </Suspense>
      )}

      <VoidMask
        phase={state.phase}
        direction={state.direction}
        mode={xrMode ? 'xr' : 'flat'}
        onMaskComplete={transition.maskComplete}
        onRevealComplete={transition.revealComplete}
      />
    </>
  )
}
