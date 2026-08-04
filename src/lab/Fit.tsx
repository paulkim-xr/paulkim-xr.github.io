import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { fitDistance, orthoZoom } from '../lib/framing'

const ORIGIN = new Vector3()

/**
 * Keeps a flat piece wholly inside the viewport, whatever its shape.
 *
 * A fixed zoom is a fixed assumption about how wide the window is. Circles was
 * composed at 44 units to the pixel, which wants 421px of width — more than a
 * phone has, so the outer rings fell off the sides of a piece that is mostly
 * about its outer rings.
 */
export function FitOrthographic({
  width,
  height,
  margin = 1,
}: {
  width: number
  height: number
  margin?: number
}) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    camera.zoom = orthoZoom(size, { width, height }, margin)
    camera.updateProjectionMatrix()
  }, [camera, size, width, height, margin])

  return null
}

/**
 * Pulls a perspective camera back far enough to hold a subject of `radius`.
 *
 * Only ever back. The distance the scene was composed at is read off the
 * camera on mount and used as the floor, so a wide window keeps the shot it
 * was given and a narrow one gets the room it needs.
 */
export function FitPerspective({ radius }: { radius: number }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const composed = useRef<number | null>(null)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    const offset = camera.position.clone().sub(ORIGIN)
    const current = offset.length()
    if (current === 0) return

    composed.current ??= current
    const distance = fitDistance(radius, camera.fov, size.width / size.height, composed.current)

    camera.position.copy(ORIGIN).addScaledVector(offset, distance / current)
    camera.updateProjectionMatrix()
  }, [camera, size, radius])

  return null
}
