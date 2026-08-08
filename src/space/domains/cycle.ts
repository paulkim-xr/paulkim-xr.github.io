import type { Domain } from '../domain'
import type { Intents } from '../intents'

/** Radians of turn that add up to one step along the ring. */
export const STEP_THRESHOLD = 0.35

export type CycleState = {
  index: number
  /** Turn banked but not yet spent on a step. */
  turned: number
  /** True once something has been picked; the ring stops taking input. */
  chosen: boolean
}

/**
 * A ring of n things, one of them in front.
 *
 * Zero-dimensional and cyclic — the smallest space in the collection, and the
 * one that is not `Embodied`: a transformation changes the world while the
 * viewer holds still, so there is no pose here and no rig. What the hub takes
 * from this design is its input, so that the arrow keys mean one thing.
 */
export function cycleDomain(count: number): Domain<CycleState> {
  return {
    needs: ['yaw', 'act'],

    initial: (): CycleState => ({ index: 0, turned: 0, chosen: false }),

    step(state: CycleState, intents: Intents): CycleState {
      if (state.chosen) return state
      if (intents.act) return { ...state, chosen: true }
      if (count <= 1) return state

      let index = state.index
      let turned = state.turned + intents.yaw

      while (Math.abs(turned) >= STEP_THRESHOLD) {
        const step = Math.sign(turned)
        index = (((index + step) % count) + count) % count
        turned -= step * STEP_THRESHOLD
      }

      return { index, turned, chosen: false }
    },
  }
}
