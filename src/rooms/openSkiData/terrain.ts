import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'
import { pointAlong, requirePlace } from './graph'
import type { Link, Resort } from './resort'

/** How many samples a link's line is cut into. Enough that a belly reads as a curve. */
const SAMPLES = 48

/** The line a link takes through the air, as points. */
export function lineOf(resort: Resort, link: Link): Vector3[] {
  return Array.from({ length: SAMPLES + 1 }, (_, step) =>
    pointAlong(resort, link, step / SAMPLES),
  )
}

/** The line a link takes, as a curve a tube can be swept along. */
export function curveOf(resort: Resort, link: Link): CatmullRomCurve3 {
  return new CatmullRomCurve3(lineOf(resort, link))
}

/**
 * A slope, as a ribbon of ground rather than a wire.
 *
 * Slopes are the one thing here with width — a run is a piece of mountain you
 * can be anywhere across, not a line you are threaded onto — and drawing them
 * as cable would have said the registry holds routes when what it holds is
 * geometry.
 *
 * Laid flat: the ribbon is widened horizontally, across the direction of
 * travel, so it reads as ground seen at an angle rather than as a wall.
 */
export function slopeRibbon(resort: Resort, link: Link, width: number): BufferGeometry {
  const line = lineOf(resort, link)
  const across = new Vector3()
  const along = new Vector3()
  const positions: number[] = []

  for (let step = 0; step < line.length; step++) {
    const here = line[step]
    along.subVectors(line[Math.min(step + 1, line.length - 1)], line[Math.max(step - 1, 0)])
    // Across the path and level, whatever the path is doing vertically. Using
    // the true normal instead would roll the ribbon on its side wherever the
    // run steepened.
    across.set(-along.z, 0, along.x)
    if (across.lengthSq() < 1e-9) across.set(1, 0, 0)
    across.setLength(width / 2)

    positions.push(
      here.x - across.x,
      here.y,
      here.z - across.z,
      here.x + across.x,
      here.y,
      here.z + across.z,
    )
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

  const index: number[] = []
  for (let step = 0; step < line.length - 1; step++) {
    const corner = step * 2
    index.push(corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2)
  }
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** How many rings the contour map is drawn with, and how far apart they sit. */
const CONTOURS = 9
const CONTOUR_STEP = 1.7

/**
 * The mountain, as contour rings and nothing else.
 *
 * There is no terrain mesh in this room on purpose. The registry does not hold
 * a mountain; it holds measurements of one, and a solid hillside would be the
 * room asserting ground that nobody has surveyed. Rings at fixed heights are
 * what a survey actually produces, and they give the eye somewhere to put the
 * graph without inventing anything.
 *
 * Sized from the places themselves, so the contours describe the resort in the
 * registry rather than a mountain drawn to look nice behind it.
 */
export function contourRings(resort: Resort): BufferGeometry {
  const peak = Math.max(...resort.places.map((place) => place.at.y))
  const spread = Math.max(
    ...resort.places.map((place) => Math.hypot(place.at.x, place.at.z)),
  )

  const positions: number[] = []
  const segments = 96

  for (let ring = 0; ring < CONTOURS; ring++) {
    const height = ring * CONTOUR_STEP
    // Narrowing with height, the way a hill does. The lowest ring is wider
    // than the resort so the base area sits inside the map rather than on its
    // edge.
    const radius = spread * 1.25 * (1 - (height / (peak + CONTOUR_STEP)) ** 1.6)
    if (radius <= 0.2) continue

    for (let step = 0; step < segments; step++) {
      for (const angle of [
        (step / segments) * Math.PI * 2,
        ((step + 1) / segments) * Math.PI * 2,
      ]) {
        positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

/** The line of a link as a flat pair-list, for drawing it as line segments. */
export function segmentsOf(resort: Resort, link: Link): number[] {
  const line = lineOf(resort, link)
  const flat: number[] = []

  for (let step = 0; step < line.length - 1; step++) {
    flat.push(line[step].x, line[step].y, line[step].z)
    flat.push(line[step + 1].x, line[step + 1].y, line[step + 1].z)
  }
  return flat
}

/** A short mast under a place, so it reads as standing on the mountain. */
export function mastOf(resort: Resort, id: string, drop: number): number[] {
  const at = requirePlace(resort, id).at
  return [at.x, at.y, at.z, at.x, at.y - drop, at.z]
}
