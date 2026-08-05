/** Clamps to the unit interval. */
export function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

/** Hermite ease, clamped. Flat at both ends, so a ramp has no corners. */
export function smoothstep(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Where `t` sits between `from` and `to`, as a clamped fraction.
 *
 * Useful for running one ramp over part of another's span — a value that stays
 * at 0 until `from`, then climbs to 1 by `to`.
 */
export function unlerp(from: number, to: number, t: number): number {
  if (to === from) return t >= to ? 1 : 0
  return clamp01((t - from) / (to - from))
}
