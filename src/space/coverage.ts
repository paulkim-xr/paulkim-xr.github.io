import type { IntentField } from './intents'
import type { AnyTechnique, Signal } from './technique'

/** A class of device, described by what raw input it can offer. */
export type Profile = { name: string; signals: readonly Signal[] }

/**
 * The devices every room is required to work on.
 *
 * A phone is a pointer and nothing else, which is the whole reason this check
 * exists: walking used to be bound to held keys in every room, so on touch
 * all three were panorama viewers.
 */
export const PROFILES: readonly Profile[] = [
  { name: 'desktop', signals: ['keys', 'pointer'] },
  { name: 'phone', signals: ['pointer'] },
]

/**
 * The fields a domain needs that this device has no way to ask for.
 *
 * Empty is the only acceptable answer. A technique counts only if the profile
 * offers every signal it requires — a keyboard technique on a phone produces
 * nothing at all, however much it claims to produce.
 */
export function unreachableFields(
  needs: readonly IntentField[],
  techniques: readonly AnyTechnique[],
  profile: Profile,
): IntentField[] {
  const usable = techniques.filter((technique) =>
    technique.requires.every((signal) => profile.signals.includes(signal)),
  )
  const available = new Set(usable.flatMap((technique) => [...technique.produces]))

  return needs.filter((field) => !available.has(field))
}
