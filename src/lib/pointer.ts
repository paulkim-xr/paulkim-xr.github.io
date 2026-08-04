/**
 * What the visitor is pointing with, and what to tell them to do about it.
 */

/**
 * True when the primary pointer is a finger rather than a mouse.
 *
 * `(pointer: coarse)` asks about the *primary* input, which is the question
 * worth asking: a laptop with a touchscreen still has a mouse and still wants
 * to be told about arrow keys.
 */
export function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * The hub's one line of instruction.
 *
 * There are no arrow keys on a phone and nothing there is clicked, so the
 * desktop wording is not merely unhelpful on touch — it names two controls
 * that do not exist and omits the two that do.
 */
export function browseHint(coarse: boolean): string {
  return coarse ? 'swipe to browse · tap to enter' : '← → to browse · click to enter'
}
