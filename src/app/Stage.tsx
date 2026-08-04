import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import { getRoom, rooms } from '../content/registry'
import { Carousel3D } from '../hub/Carousel3D'
import { SceneGate } from '../transition/SceneGate'
import { VoidMask } from '../transition/VoidMask'
import { isLocked, shouldMountScene } from '../transition/machine'
import type { Transition } from '../transition/useTransition'

type StageProps = {
  activeIndex: number
  transition: Transition
  onStep: (delta: number) => void
  xrMode: boolean
}

export function Stage({ activeIndex, transition, onStep, xrMode }: StageProps) {
  const { state } = transition
  const room = state.target ? getRoom(state.target) : undefined
  const showHub = state.phase !== 'inRoom'
  const Scene = room?.scene

  return (
    <>
      <color attach="background" args={['#08080c']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} castShadow={false} />

      {showHub && (
        <Carousel3D
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
          target={[0, 0.2, -1.6]}
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
