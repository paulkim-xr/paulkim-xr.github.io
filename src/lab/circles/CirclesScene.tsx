import { useEffect, useMemo } from 'react'
import { BufferGeometry, CubicBezierCurve3, Float32BufferAttribute, Vector3 } from 'three'
import { FitOrthographic } from '../Fit'
import { buildCircleField } from './field'

/**
 * Grid density. The original used 45x60 in window pixels; this is the same
 * picture at a size a headset can hold, and the cost is linear in cells.
 */
const COLUMNS = 52
const ROWS = 38
const SEGMENTS = 20
const SAMPLES = 90

const WIDTH = 9.56
const HEIGHT = 7.22

/**
 * Z spread across the columns.
 *
 * Not depth — this piece is flat, and it is viewed through an orthographic
 * camera that cannot see Z at all. It exists only to put the circles in a
 * defined front-to-back order so that which ring overdraws which is decided
 * rather than left to buffer order. That is all it ever did in the original.
 */
const DRAW_ORDER_SPREAD = 4

/** Breathing room around the piece, so it never runs into the caption. */
const FRAME_MARGIN = 0.94

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
 * curves and whose colour says which of the three it is nearest to.
 *
 * Flat by nature. The piece is a composition in a plane, and the only job Z
 * ever had here was deciding which ring draws over which — so it is shown
 * through an orthographic camera, head on, with nothing to orbit.
 *
 * The whole field is one line-segment buffer. The original built a torus mesh
 * per cell, which is 1,976 draw calls at this density and unshippable.
 */
export function CirclesScene() {
  const geometry = useMemo(() => {
    const field = buildCircleField({
      columns: COLUMNS,
      rows: ROWS,
      width: WIDTH,
      height: HEIGHT,
      depth: DRAW_ORDER_SPREAD,
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

  /**
   * How much room the drawn piece actually takes.
   *
   * Not WIDTH and HEIGHT: those size the grid of ring *centres*, and a ring is
   * as wide as its distance to the nearest curve, so the drawing spills well
   * past the grid on every side. Measured off the built geometry, and doubled
   * about the origin because the camera looks at the origin and cannot be
   * asked to fit something lopsided by zoom alone.
   */
  const extent = useMemo(() => {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) return { width: WIDTH, height: HEIGHT }

    return {
      width: 2 * Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
      height: 2 * Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
    }
  }, [geometry])

  return (
    <>
      <FitOrthographic width={extent.width} height={extent.height} margin={FRAME_MARGIN} />
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors toneMapped={false} transparent opacity={0.85} />
      </lineSegments>
    </>
  )
}
