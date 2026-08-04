/**
 * Fitting a scene to a viewport whose shape is not known in advance.
 *
 * Every camera in this project was framed on a landscape window, where width
 * is the generous axis and only height needs checking. On a phone held upright
 * that is exactly backwards: the horizontal field of view is the narrow one,
 * and anything sized against height alone runs off both edges.
 *
 * Pure functions, no three.js — the arithmetic is the part worth testing, and
 * it is the same arithmetic for the hub, the lab pieces and anything added
 * later.
 */

/** Degrees to radians. */
const RADIANS = Math.PI / 180

/**
 * How far back a perspective camera must sit to contain a sphere of `radius`.
 *
 * Fits against whichever field of view is tighter, so the result is correct in
 * portrait and in landscape rather than only the one it was tuned in.
 *
 * `minimum` is the distance the shot was composed at. The camera is never
 * brought closer than that — a wide window should not march the camera in and
 * re-frame a composition that was already right; it should only ever be pushed
 * back when the frame is too narrow to hold the subject.
 */
export function fitDistance(
  radius: number,
  fovDegrees: number,
  aspect: number,
  minimum = 0,
): number {
  const tallness = Math.tan((fovDegrees / 2) * RADIANS)
  const wideness = tallness * aspect
  const tightest = Math.min(tallness, wideness)

  // A canvas with no width yet, or a nonsense aspect. Nothing to fit against,
  // so keep the composed distance rather than dividing by zero.
  if (!Number.isFinite(tightest) || tightest <= 0) return minimum

  return Math.max(minimum, radius / tightest)
}

/**
 * The zoom an orthographic camera needs to contain `extent` world units.
 *
 * Contain rather than cover: for a flat composition, the edges are part of the
 * work, and cropping them to fill the screen throws away the piece to keep the
 * background company.
 */
export function orthoZoom(
  viewport: { width: number; height: number },
  extent: { width: number; height: number },
  margin = 1,
): number {
  if (extent.width <= 0 || extent.height <= 0) return 1
  if (viewport.width <= 0 || viewport.height <= 0) return 1

  return Math.min(viewport.width / extent.width, viewport.height / extent.height) * margin
}
