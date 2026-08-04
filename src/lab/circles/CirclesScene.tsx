import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CubicBezierCurve3,
  Float32BufferAttribute,
  Vector3,
  type Group,
} from 'three'
import { buildCircleField } from './field'

/**
 * Grid density. The original used 45x60 in window pixels; this is the same
 * picture at a size a headset can hold, and the cost is linear in cells.
 */
const COLUMNS = 52
const ROWS = 38
const SEGMENTS = 20
const SAMPLES = 90

const WIDTH = 9
const HEIGHT = 6.4
/** How far the grid rakes away from the viewer across its columns. */
const DEPTH = 3.2

const DRIFT = 0.12

/** The three curves the colour channels are measured from, in grid units. */
function channelCurves(phase: number) {
  const swing = (amount: number) => Math.sin(phase) * amount

  return [
    new CubicBezierCurve3(
      new Vector3(-4.2, -3.1 + swing(0.4), 0),
      new Vector3(1.6, -0.4, 0),
      new Vector3(-4.8, 0.7, 0),
      new Vector3(0.5, 3.0, 0),
    ),
    new CubicBezierCurve3(
      new Vector3(-0.4, -3.0, 0),
      new Vector3(3.0, 0.3 + swing(0.5), 0),
      new Vector3(-1.7, 1.4, 0),
      new Vector3(4.4, 2.4, 0),
    ),
    new CubicBezierCurve3(
      new Vector3(-4.9, -0.3, 0),
      new Vector3(0.3, 1.9, 0),
      new Vector3(2.1, -3.1 + swing(0.45), 0),
      new Vector3(4.6, -0.5, 0),
    ),
  ] as const
}

/**
 * Circles, from the earlier three.js pages.
 *
 * A grid of rings whose radius is the distance to the nearest of three Bézier
 * curves and whose colour says which of the three it is nearest to. The whole
 * field is one line-segment buffer — the original built a torus mesh per cell,
 * which is 1,976 draw calls at this density and unshippable to a headset.
 */
export function CirclesScene() {
  const drifting = useRef<Group>(null)

  const geometry = useMemo(() => {
    const field = buildCircleField({
      columns: COLUMNS,
      rows: ROWS,
      width: WIDTH,
      height: HEIGHT,
      depth: DEPTH,
      curves: channelCurves(0),
      samples: SAMPLES,
      segments: SEGMENTS,
    })

    const built = new BufferGeometry()
    built.setAttribute('position', new Float32BufferAttribute(field.positions, 3))
    built.setAttribute('color', new Float32BufferAttribute(field.colors, 3))
    return built
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state) => {
    if (!drifting.current) return
    // The field is fixed; the viewpoint is not. Rebuilding the distance field
    // per frame would cost 1,976 cells x 3 curves x 90 samples of work.
    drifting.current.rotation.y = Math.sin(state.clock.elapsedTime * DRIFT) * 0.28
    drifting.current.rotation.x = Math.sin(state.clock.elapsedTime * DRIFT * 0.7) * 0.1
  })

  return (
    <group ref={drifting}>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors toneMapped={false} transparent opacity={0.85} />
      </lineSegments>
    </group>
  )
}
