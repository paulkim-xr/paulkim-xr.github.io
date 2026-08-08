import { Vector3 } from 'three'
import { isTravellable, linksFrom, pointAlong, requirePlace } from './graph'
import type { Link, Resort } from './resort'

/**
 * How fast the viewer moves along a link, in units a second.
 *
 * Slow enough that going somewhere is a journey with a view from it, rather
 * than a cut. Riding a lift up a mountain is mostly the ride.
 */
export const SPEED = 5.5

/**
 * Where the viewer is: standing at a place, or on their way between two.
 *
 * Standing still they have a choice pending — which of the links leaving here
 * they are pointed at. Moving, they have none: you cannot get off a chairlift
 * halfway, and pretending otherwise would make the graph decorative rather than
 * the thing you are actually travelling.
 */
export type Journey =
  | { at: 'place'; place: string; choice: number }
  | { at: 'link'; link: Link; progress: number }

/** The journey a viewer starts with: standing at `place`, pointed at its first link. */
export function startAt(place: string): Journey {
  return { at: 'place', place, choice: 0 }
}

/** The link the viewer is currently pointed at, or undefined if they are moving. */
export function pointedAt(resort: Resort, journey: Journey): Link | undefined {
  if (journey.at !== 'place') return undefined
  const links = linksFrom(resort, journey.place)
  return links[wrap(journey.choice, links.length)]
}

/**
 * The journey after looking one step round the choices.
 *
 * Wraps, so there is no dead end at either end of the list — a viewer holding
 * a key down cycles rather than sticking.
 */
export function look(resort: Resort, journey: Journey, step: number): Journey {
  if (journey.at !== 'place') return journey
  const count = linksFrom(resort, journey.place).length
  if (count === 0) return journey

  return { ...journey, choice: wrap(journey.choice + step, count) }
}

/**
 * The journey after setting off along whatever is currently chosen.
 *
 * An unsurveyed link refuses. That refusal is the room's whole argument: the
 * data does not exist, so neither does the way through, and no amount of
 * wanting to go changes it until somebody surveys the run and opens a pull
 * request.
 */
export function depart(resort: Resort, journey: Journey): Journey {
  const link = pointedAt(resort, journey)
  if (!link || !isTravellable(link)) return journey
  return { at: 'link', link, progress: 0 }
}

/**
 * The journey `seconds` later.
 *
 * On arrival the viewer is put down at the far place already pointed at its
 * first link, so a run of hops needs no fiddling in between.
 */
export function advance(resort: Resort, journey: Journey, seconds: number): Journey {
  if (journey.at !== 'link') return journey

  const span = lengthOf(resort, journey.link)
  const progress = journey.progress + (SPEED * seconds) / span

  if (progress >= 1) return startAt(journey.link.to)
  return { ...journey, progress }
}

/** How long a link is, end to end. */
export function lengthOf(resort: Resort, link: Link): number {
  return requirePlace(resort, link.from).at.distanceTo(requirePlace(resort, link.to).at)
}

/** Where the viewer's feet are. */
export function positionOf(resort: Resort, journey: Journey): Vector3 {
  if (journey.at === 'place') return requirePlace(resort, journey.place).at.clone()
  return pointAlong(resort, journey.link, journey.progress)
}

/**
 * What the viewer is looking at.
 *
 * Standing, they look along the link they are considering — so the choice is
 * shown by the view rather than by a cursor on a list. Moving, they look a
 * little further along the way they are going, which is what makes a lift ride
 * read as travel and not as being dragged backwards through a scene.
 */
export function focusOf(resort: Resort, journey: Journey): Vector3 {
  if (journey.at === 'place') {
    const link = pointedAt(resort, journey)
    if (link) return requirePlace(resort, link.to).at.clone()
    return requirePlace(resort, journey.place).at.clone().add(new Vector3(0, 0, -1))
  }

  const ahead = Math.min(1, journey.progress + LOOK_AHEAD)
  // At the very end of a link, looking `LOOK_AHEAD` on would be looking at the
  // place already arrived at, from no distance at all. Aim at the far end
  // instead, which is where the eye is going anyway.
  if (ahead >= 1) return requirePlace(resort, journey.link.to).at.clone()
  return pointAlong(resort, journey.link, ahead)
}

/** How far ahead along a link the viewer looks while travelling it. */
const LOOK_AHEAD = 0.12

/** `value` brought into `0..count-1`, wrapping in both directions. */
function wrap(value: number, count: number): number {
  if (count <= 0) return 0
  return ((value % count) + count) % count
}
