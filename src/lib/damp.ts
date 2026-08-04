/**
 * Frame-rate-independent exponential easing.
 *
 * `lambda` is the decay rate: higher is snappier. The remaining distance is
 * multiplied by e^(-lambda * dt) each call, so the result depends only on
 * elapsed time — not on how many frames that time was split into.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt)
}
