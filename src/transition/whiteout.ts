import { clamp01, smoothstep, unlerp } from '../lib/ease'
import type { Direction, Phase } from './machine'

/**
 * Seconds the focus beat runs: the shape stops moving and turns white, holding
 * whatever posture it happened to be in when it was picked.
 */
export const FOCUS_SECONDS = 0.35
/** Seconds the shape spends swelling until it has swallowed the view. */
export const MASK_SECONDS = 0.65
/** Seconds the sheet spends lifting off the room, or off the returning hub. */
export const REVEAL_SECONDS = 0.5

/**
 * How large the shape grows before the sheet has the view to itself.
 *
 * Far past the point where it encloses the camera. What sells the beat is
 * passing *through* the surface rather than watching it approach, so the growth
 * has to keep going after the near face is behind the viewer.
 */
const SWELL_MAX = 18
/** A breath of growth during the focus beat, before the shape commits. */
const FOCUS_SWELL = 1.06
/**
 * Fraction of the mask beat that passes before the sheet begins to fill in.
 *
 * Late, and deliberately: the sheet is insurance, not the effect. By the time
 * it is doing anything the shape is already off every edge of the frame, so
 * what it actually covers is the gaps between wires and the holes in an open
 * surface — not the transition itself.
 */
const SHEET_DELAY = 0.45

export type Whiteout = {
  /** 0 = the shape's own accent and near-transparent fill; 1 = solid white. */
  whiten: number
  /** Multiplier on the hub shape's scale. 1 is its resting size. */
  swell: number
  /** Opacity of the sheet that guarantees the view is genuinely covered. */
  sheet: number
}

const AT_REST: Whiteout = { whiten: 0, swell: 1, sheet: 0 }
const ENGULFED: Whiteout = { whiten: 1, swell: SWELL_MAX, sheet: 1 }

/** Seconds a phase runs for. Resting phases have no duration and never end. */
export function durationFor(phase: Phase): number {
  switch (phase) {
    case 'focusing':
      return FOCUS_SECONDS
    case 'masking':
      return MASK_SECONDS
    case 'revealing':
      return REVEAL_SECONDS
    default:
      return Infinity
  }
}

/**
 * What the whiteout looks like `progress` of the way through a phase.
 *
 * Selecting a project does not fade the screen out and the room in. The shape
 * you picked freezes where it stands, turns white, and grows until it has taken
 * the whole field of view — and the room opens out of that. The object is the
 * door rather than something a door was drawn over.
 *
 * Pure, and a function of phase alone, so the whole sequence can be checked
 * without a renderer: every consumer derives its own numbers from the same
 * clock rather than passing them between components frame by frame.
 */
export function whiteoutAt(phase: Phase, direction: Direction, progress: number): Whiteout {
  const t = clamp01(progress)

  switch (phase) {
    case 'browsing':
    case 'inRoom':
      return AT_REST

    case 'focusing': {
      // Leaving never focuses: there is no hub on screen to take hold of.
      if (direction === 'out') return AT_REST
      const eased = smoothstep(t)
      return { whiten: eased, swell: 1 + (FOCUS_SWELL - 1) * eased, sheet: 0 }
    }

    case 'masking': {
      // On the way out the room is what is on screen, so there is nothing to
      // swell — the sheet closes over it on its own.
      if (direction === 'out') return { ...ENGULFED, sheet: smoothstep(t) }

      // Accelerating rather than eased: the shape should look like it is
      // rushing the viewer, and a curve that settles at the end reads as the
      // growth running out of steam just as it ought to be overwhelming.
      return {
        whiten: 1,
        swell: FOCUS_SWELL + (SWELL_MAX - FOCUS_SWELL) * t * t,
        sheet: smoothstep(unlerp(SHEET_DELAY, 1, t)),
      }
    }

    case 'swapping':
      return ENGULFED

    case 'revealing': {
      const eased = smoothstep(t)
      // Entering, the hub is already gone and only the sheet lifts. Leaving, the
      // hub is back — still white and still enormous — and shrinks down into the
      // shape you left, which is the way in played backwards.
      if (direction === 'in') return { ...ENGULFED, sheet: 1 - eased }
      return {
        whiten: 1 - eased,
        swell: SWELL_MAX + (1 - SWELL_MAX) * eased,
        sheet: 1 - eased,
      }
    }
  }
}
