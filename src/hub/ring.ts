const TAU = Math.PI * 2

/** Angular spacing between neighbouring items. Zero for a ring of 0 or 1. */
export function angleStep(count: number): number {
  return count > 1 ? TAU / count : 0
}

/**
 * Item positions on a ring in the XZ plane, item 0 at +Z (nearest a camera
 * looking down -Z) and subsequent items proceeding counter-clockwise.
 */
export function ringPositions(count: number, radius: number): [number, number, number][] {
  const step = angleStep(count)
  return Array.from({ length: count }, (_, index) => {
    const angle = step * index
    return [Math.sin(angle) * radius, 0, Math.cos(angle) * radius]
  })
}

/**
 * Signed number of steps from `from` to `to` taking the shorter way round.
 * Ties (exactly half a ring) resolve forwards.
 */
export function shortestDelta(from: number, to: number, count: number): number {
  if (count <= 1) return 0
  const raw = (((to - from) % count) + count) % count
  return raw > count / 2 ? raw - count : raw
}

/**
 * The absolute rotation the ring should ease toward so that `index` faces the
 * camera, expressed relative to the *current* rotation so the ring never
 * unwinds. Pass the value this returned last time as `currentRotation`.
 */
export function targetRotation(currentRotation: number, index: number, count: number): number {
  const step = angleStep(count)
  if (step === 0) return currentRotation

  // Which index the ring is currently showing, derived from its rotation.
  const currentIndex = Math.round(-currentRotation / step)
  const delta = shortestDelta(((currentIndex % count) + count) % count, index, count)
  return currentRotation - delta * step
}
