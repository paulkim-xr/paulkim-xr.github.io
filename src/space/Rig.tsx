import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Embodied } from './domain'

/**
 * The head's own axis of tilt, in camera-local terms.
 *
 * A camera looks along its −Z with +Y over its head, so rotating about +X
 * swings −Z towards +Y — which is looking up.
 */
const PITCH_AXIS = new Vector3(1, 0, 0)
const WORLD_UP = new Vector3(0, 1, 0)

type RigProps<S> = {
  domain: Embodied<S>
  state: RefObject<S>
  /** A frame of input, applied. Called here so the pose read below is the one
   *  this frame's input produced, rather than the previous frame's. */
  advance: (seconds: number, now: number) => void
}

/**
 * Where the domain says the viewer is, applied to the camera.
 *
 * The one place in this codebase that touches the camera. Rooms emit a pose
 * and nothing else, which is what makes XR reachable at all: there the headset
 * owns the camera and the same pose goes onto an `XROrigin` instead, without a
 * room being edited.
 *
 * The state is read here rather than passed in as a prop. A room advances its
 * state inside the frame loop and never re-renders for it, so a pose handed
 * over as a prop would be the one computed when the room last rendered and
 * would never change again.
 *
 * Pitch is applied here rather than folded into the pose because in XR it has
 * to be dropped — a domain's pitch would tilt the world beneath a stationary
 * head, which is both wrong and nauseating.
 */
export function Rig<S>({ domain, state, advance }: RigProps<S>): null {
  const tilt = useMemo(() => new Quaternion(), [])
  const camera = useThree((three) => three.camera)

  /**
   * Hands the camera back the way it was found.
   *
   * A space where up is not world up leaves `camera.up` tipped over wherever
   * the viewer stopped, and every `lookAt` in the app reads that vector — so
   * without this the hub comes back rolled at whatever angle the room was left
   * at, and stays there, because nothing else ever writes it.
   *
   * Here rather than in the room, because the rig is what dirtied it. A room
   * that has to remember to tidy up after a thing it does not do is a room
   * that will one day forget.
   */
  useEffect(() => {
    return () => {
      camera.up.set(0, 1, 0)
    }
  }, [camera])

  useFrame((_state, delta) => {
    advance(delta, performance.now())

    const pose = domain.poseOf(state.current)
    place(pose.position, pose.orientation, domain.pitchOf(state.current), tilt, _state.camera)
  })

  return null
}

/** Applied as its own function so the frame callback reads as one statement. */
function place(
  position: Vector3,
  orientation: Quaternion,
  pitch: number,
  tilt: Quaternion,
  target: { position: Vector3; quaternion: Quaternion; up: Vector3 },
): void {
  target.position.copy(position)
  target.quaternion.copy(orientation).multiply(tilt.setFromAxisAngle(PITCH_AXIS, pitch))
  // Three derives the view matrix from the quaternion, but still reads `up` in
  // places — `lookAt`, and any control that attaches later. Keeping it in step
  // stops a room rolling the moment anything else touches the camera.
  target.up.copy(WORLD_UP).applyQuaternion(target.quaternion)
}
