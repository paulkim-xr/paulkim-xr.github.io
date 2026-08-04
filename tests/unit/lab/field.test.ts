import { describe, expect, test } from 'vitest'
import { CubicBezierCurve3, Vector3 } from 'three'
import {
  buildCircleField,
  distanceToCurve,
  distancesToColor,
  type CircleFieldOptions,
} from '../../../src/lab/circles/field'

const line = (from: Vector3, to: Vector3) =>
  new CubicBezierCurve3(from, from.clone().lerp(to, 1 / 3), from.clone().lerp(to, 2 / 3), to)

const CURVES = [
  line(new Vector3(-2, -1, 0), new Vector3(2, 1, 0)),
  line(new Vector3(-2, 1, 0), new Vector3(2, -1, 0)),
  line(new Vector3(0, -2, 0), new Vector3(0, 2, 0)),
] as const

const OPTIONS: CircleFieldOptions = {
  columns: 8,
  rows: 6,
  width: 4,
  height: 3,
  depth: 1,
  curves: CURVES,
  samples: 40,
  segments: 12,
}

describe('distanceToCurve', () => {
  test('a point on the curve is at no distance from it', () => {
    const on = CURVES[2].getPoint(0.5)
    expect(distanceToCurve(on, CURVES[2], 200)).toBeCloseTo(0, 3)
  })

  test('measures perpendicular distance, not distance to an endpoint', () => {
    // Straight up from the middle of the vertical curve.
    const beside = new Vector3(0.5, 0, 0)
    expect(distanceToCurve(beside, CURVES[2], 200)).toBeCloseTo(0.5, 2)
  })

  test('more samples never report a longer distance', () => {
    const point = new Vector3(1.3, -0.4, 0)
    const coarse = distanceToCurve(point, CURVES[0], 8)
    const fine = distanceToCurve(point, CURVES[0], 400)
    expect(fine).toBeLessThanOrEqual(coarse + 1e-9)
  })
})

describe('distancesToColor', () => {
  test('the nearest curve owns its channel outright', () => {
    const [r, g, b] = distancesToColor([0, 1, 2], 4)
    expect(r).toBe(1)
    expect(b).toBe(0)
    expect(g).toBeGreaterThan(0)
    expect(g).toBeLessThan(1)
  })

  test('every channel lands inside the unit range', () => {
    for (const distances of [
      [0, 0.5, 3],
      [2.2, 0.1, 1.4],
      [4, 4, 0],
    ] as const) {
      for (const channel of distancesToColor(distances, 4)) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })

  test('equidistant from all three is grey, not a division by zero', () => {
    expect(distancesToColor([1, 1, 1], 4)).toEqual([0.5, 0.5, 0.5])
  })
})

describe('buildCircleField', () => {
  test('produces one circle per grid cell', () => {
    expect(buildCircleField(OPTIONS).circles).toBe(OPTIONS.columns * OPTIONS.rows)
  })

  test('every circle is a closed loop of line segments', () => {
    const field = buildCircleField(OPTIONS)
    const expected = OPTIONS.columns * OPTIONS.rows * OPTIONS.segments * 2 * 3

    expect(field.positions).toHaveLength(expected)
    expect(field.colors).toHaveLength(expected)
  })

  test('every coordinate and colour is a real number', () => {
    const field = buildCircleField(OPTIONS)
    for (let index = 0; index < field.positions.length; index++) {
      expect(Number.isFinite(field.positions[index])).toBe(true)
      expect(Number.isFinite(field.colors[index])).toBe(true)
    }
  })

  test('the grid spans the width and height it was given', () => {
    const field = buildCircleField({ ...OPTIONS, segments: 3 })
    let minX = Infinity
    let maxX = -Infinity

    for (let index = 0; index < field.positions.length; index += 3) {
      minX = Math.min(minX, field.positions[index])
      maxX = Math.max(maxX, field.positions[index])
    }

    // Circle radii push past the grid edge, so this is a floor not an equality.
    expect(maxX - minX).toBeGreaterThanOrEqual(OPTIONS.width)
  })

  test('a single-column grid does not divide by zero', () => {
    const field = buildCircleField({ ...OPTIONS, columns: 1, rows: 1 })
    for (let index = 0; index < field.positions.length; index++) {
      expect(Number.isFinite(field.positions[index])).toBe(true)
    }
  })

  test('is deterministic — two builds agree exactly', () => {
    const first = buildCircleField(OPTIONS)
    const second = buildCircleField(OPTIONS)
    expect(Array.from(second.positions)).toEqual(Array.from(first.positions))
  })
})
