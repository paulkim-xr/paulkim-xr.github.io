import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { PerspectiveCamera } from 'three'
import { getRoom, rooms } from '../content/registry'
import { fitDistance } from '../lib/framing'
import { MorphHub } from '../hub/MorphHub'
import { SceneGate } from '../transition/SceneGate'
import { WhiteSheet } from '../transition/Whiteout'
import { shouldMountScene, usesRoomFraming } from '../transition/machine'
import type { Transition } from '../transition/useTransition'

/** Close enough that one shape a metre across fills the frame, with the
 *  title legible below it. The Z is the landscape framing, and the floor the
 *  camera is pulled back from on a narrower window — never closer. */
const HUB_CAMERA = [0, 0.15, 3.3] as const
const HUB_TARGET = [0, -0.3, 0] as const
/** Close enough to read a panel two metres away. */
const ROOM_CAMERA = [0, 0.75, 2.6] as const
const ROOM_TARGET = [0, 0.4, -2] as const

/**
 * Reach of the biggest shape the hub will hold: the bound every shape is
 * tested against, times the hub's scale, plus a little air.
 */
const HUB_RADIUS = 1.25

/**
 * Moves the camera between hub and room framing. Both jumps land while the
 * void is fully closed, so there is nothing to animate and nothing to see.
 * In XR the headset owns the camera and this must not touch it.
 */
function CameraRig({ roomFraming, enabled }: { roomFraming: boolean; enabled: boolean }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useEffect(() => {
    if (!enabled) return
    const [px, py, pz] = roomFraming ? ROOM_CAMERA : HUB_CAMERA
    const [tx, ty, tz] = roomFraming ? ROOM_TARGET : HUB_TARGET

    // The hub is one object filling the frame, so it is the thing that runs
    // off the sides when the window is portrait. The room is furniture with
    // depth and keeps its framing — a panel two metres back already fits.
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 50
    const distance = roomFraming
      ? pz
      : fitDistance(HUB_RADIUS, fov, size.width / size.height, pz)

    camera.position.set(px, py, distance)
    camera.lookAt(tx, ty, tz)
  }, [roomFraming, enabled, camera, size])

  return null
}

type StageProps = {
  activeIndex: number
  transition: Transition
  xrMode: boolean
}

export function Stage({ activeIndex, transition, xrMode }: StageProps) {
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

      {/* Left enabled even for a room that drives its own camera. That room
          overrides it every frame while it is mounted, and this is what puts
          the camera back into hub framing once it is not. */}
      <CameraRig roomFraming={usesRoomFraming(state)} enabled={!xrMode} />

      {showHub && (
        <MorphHub
          rooms={rooms}
          activeIndex={activeIndex}
          phase={state.phase}
          direction={state.direction}
        />
      )}

      {/* Flat room navigation is orbit, per the spec's parity table. It exists
          only inside a room — orbiting the hub would fight the carousel — and
          never in XR, where the headset owns the camera. Rooms you move
          *through* rather than look at drive the camera themselves and opt out,
          or the two would fight over it every frame. */}
      {!xrMode && state.phase === 'inRoom' && !room?.ownsCamera && (
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

      <WhiteSheet
        phase={state.phase}
        direction={state.direction}
        mode={xrMode ? 'xr' : 'flat'}
        onMaskComplete={transition.maskComplete}
        onRevealComplete={transition.revealComplete}
      />
    </>
  )
}
