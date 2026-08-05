import { smoothstep } from '../lib/ease'

/**
 * How the hub's surface dissolves and reassembles around a morph.
 *
 * Mid-flight a triangle means nothing — its three vertices are heading for
 * three unrelated corners of the next shape, so the face it spans is an
 * artefact of the buffer rather than anything about either project. The
 * surface therefore leaves *before* the vertices move and returns as they
 * land, and the edges only thin out rather than vanish, so the flight itself
 * stays visible as a moving wire cloud.
 */
export type MorphTiming = {
  /** Seconds the surface spends dissolving before any vertex moves. */
  lead: number
  /** Seconds the vertices spend in flight. */
  flight: number
  /** Seconds of the flight's tail spent reassembling. Clamped to `flight`. */
  restore: number
}

export type SurfaceFade = {
  /** 0 = dissolved, 1 = fully drawn. Drives opacity. */
  presence: number
  /** 0 = the shape being left, 1 = the shape being flown to. Drives colour. */
  blend: number
}

/**
 * The fade state at `time` seconds after a step was requested.
 *
 * Negative and past-the-end times both read as a fully drawn resting shape,
 * so a caller can hold one origin across the whole envelope without special
 * cases at either edge.
 */
export function morphFade(time: number, timing: MorphTiming): SurfaceFade {
  return { presence: presenceAt(time, timing), blend: blendAt(time, timing) }
}

function presenceAt(time: number, { lead, flight, restore }: MorphTiming): number {
  if (time <= 0) return 1
  if (lead > 0 && time < lead) return 1 - smoothstep(time / lead)

  const inFlight = time - Math.max(0, lead)
  if (flight <= 0 || inFlight >= flight) return 1

  // A restore longer than the flight simply starts at the beginning of it.
  const restoreStart = Math.max(0, flight - restore)
  if (inFlight <= restoreStart) return 0

  return smoothstep((inFlight - restoreStart) / (flight - restoreStart))
}

function blendAt(time: number, { lead, flight }: MorphTiming): number {
  // Nothing has moved yet during the lead, so the colour must not move either.
  if (time <= Math.max(0, lead)) return 0
  if (flight <= 0) return 1

  const inFlight = time - Math.max(0, lead)
  return inFlight >= flight ? 1 : smoothstep(inFlight / flight)
}
