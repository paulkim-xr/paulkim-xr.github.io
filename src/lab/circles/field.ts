import { Vector3, type CubicBezierCurve3 } from 'three'

export type CircleFieldOptions = {
  columns: number
  rows: number
  /** Extent of the grid in world units. */
  width: number
  height: number
  /** How far the grid rakes back in Z from first column to last. */
  depth: number
  /** One curve per colour channel, in the grid's own coordinates. */
  curves: readonly [CubicBezierCurve3, CubicBezierCurve3, CubicBezierCurve3]
  /** Points sampled along each curve when measuring distance to it. */
  samples: number
  /** Segments per drawn circle. */
  segments: number
}

export type CircleField = {
  /** Line-segment endpoints: every consecutive pair is one drawn edge. */
  positions: Float32Array
  /** Linear RGB per endpoint, matching `positions`. */
  colors: Float32Array
  /** Number of circles, for reporting rather than for drawing. */
  circles: number
}

/**
 * Distance from a point to the nearest sample on a curve.
 *
 * Sampled rather than solved: the exact nearest point on a cubic Bézier is the
 * root of a quintic, and the field is built once at load where a few thousand
 * dot products cost less than the code to do it properly.
 */
export function distanceToCurve(
  point: Vector3,
  curve: CubicBezierCurve3,
  samples: number,
): number {
  const on = new Vector3()
  let nearest = Infinity

  for (let index = 0; index <= samples; index++) {
    curve.getPoint(index / samples, on)
    nearest = Math.min(nearest, point.distanceTo(on))
  }

  return nearest
}

/**
 * Turns three distances into a colour, the way the original page did.
 *
 * Near a curve means bright in that curve's channel; the triple is then
 * stretched so the closest channel is always full and the furthest always
 * empty, which is what stops the whole grid settling into one muddy hue.
 */
export function distancesToColor(
  distances: readonly [number, number, number],
  reach: number,
): [number, number, number] {
  const raw = distances.map((distance) => 1 - distance / reach) as [number, number, number]

  const high = Math.max(...raw)
  const low = Math.min(...raw)
  // Every channel equidistant: no contrast to stretch, and the original's
  // (v - min) / (max - min) would be 0/0. Mid grey is the honest answer.
  if (high === low) return [0.5, 0.5, 0.5]

  return raw.map((value) => (value - low) / (high - low)) as [number, number, number]
}

/**
 * A grid of circles whose radius is the distance to the nearest of three
 * curves, and whose colour is how near it is to each of them.
 *
 * Built as one line-segment buffer rather than one mesh per circle. The
 * original drew a torus per cell — 2,700 draw calls for a 45x60 grid, which no
 * headset will hold 72Hz through. This is one.
 */
export function buildCircleField(options: CircleFieldOptions): CircleField {
  const { columns, rows, width, height, depth, curves, samples, segments } = options

  const reach = Math.min(width, height)
  const circles = columns * rows
  const pointsPerCircle = segments * 2

  const positions = new Float32Array(circles * pointsPerCircle * 3)
  const colors = new Float32Array(circles * pointsPerCircle * 3)

  const point = new Vector3()
  let cursor = 0

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = columns > 1 ? (column / (columns - 1) - 0.5) * width : 0
      const y = rows > 1 ? (row / (rows - 1) - 0.5) * height : 0
      const z = columns > 1 ? -(column / (columns - 1)) * depth : 0

      point.set(x, y, 0)
      const distances = [
        distanceToCurve(point, curves[0], samples),
        distanceToCurve(point, curves[1], samples),
        distanceToCurve(point, curves[2], samples),
      ] as [number, number, number]

      const radius = Math.min(...distances)
      const [r, g, b] = distancesToColor(distances, reach)

      for (let segment = 0; segment < segments; segment++) {
        const from = (segment / segments) * Math.PI * 2
        const to = ((segment + 1) / segments) * Math.PI * 2

        for (const angle of [from, to]) {
          positions[cursor] = x + Math.cos(angle) * radius
          positions[cursor + 1] = y + Math.sin(angle) * radius
          positions[cursor + 2] = z
          colors[cursor] = r
          colors[cursor + 1] = g
          colors[cursor + 2] = b
          cursor += 3
        }
      }
    }
  }

  return { positions, colors, circles }
}
