import { Vector3 } from 'three'
import type { Link, Place, Resort } from './resort'

/** The place with this id, or undefined if the registry has no such entry. */
export function placeOf(resort: Resort, id: string): Place | undefined {
  return resort.places.find((place) => place.id === id)
}

/** The place with this id. Throws if it is missing, because a link to nowhere is a bug. */
export function requirePlace(resort: Resort, id: string): Place {
  const place = placeOf(resort, id)
  if (!place) throw new Error(`open-ski-data: no place "${id}"`)
  return place
}

/** Whether a link is one the viewer can actually travel. */
export function isTravellable(link: Link): boolean {
  return link.kind !== 'unsurveyed'
}

/**
 * Every link leaving `id`, in the order they fan out around the horizon.
 *
 * Sorted by bearing so that stepping left and right runs round the choices the
 * way they are arranged in front of the viewer, rather than in whatever order
 * they happen to sit in the file. Choosing the next thing to do should follow
 * what you can see, not the order somebody typed.
 *
 * Unsurveyed links are included. They cannot be taken, but leaving them out
 * would hide exactly the thing this room is about.
 */
export function linksFrom(resort: Resort, id: string): Link[] {
  const here = requirePlace(resort, id)

  return resort.links
    .filter((link) => link.from === id)
    .map((link) => ({ link, bearing: bearingTo(here, requirePlace(resort, link.to)) }))
    .sort((one, other) => one.bearing - other.bearing)
    .map(({ link }) => link)
}

/** Which way round the compass `to` lies from `from`, in radians. */
export function bearingTo(from: Place, to: Place): number {
  return Math.atan2(to.at.z - from.at.z, to.at.x - from.at.x)
}

/**
 * How far above the horizon a link climbs, at its steepest reading — used to
 * decide which way a cable sags and how a slope is drawn.
 */
export function riseOf(resort: Resort, link: Link): number {
  return requirePlace(resort, link.to).at.y - requirePlace(resort, link.from).at.y
}

/**
 * How high above the straight line between its ends a link bellies.
 *
 * Positive sags downwards. A lift is a cable strung between two towers and
 * hangs; a slope is a piece of ground and bulges the other way, because a
 * mountainside between two points is convex far more often than it is a ramp.
 * Straight lines between every pair of points would read as a diagram of a
 * resort rather than as a resort.
 */
export function bellyOf(link: Link, span: number): number {
  if (link.kind === 'lift') return -span * 0.045
  if (link.kind === 'slope') return span * 0.05
  return 0
}

/** How far apart parallel links are set, at their widest. */
const LATERAL = 1.6

/**
 * How far to one side a link is drawn, when more than one joins the same pair.
 *
 * A lift and the run beside it connect exactly the same two places, and drawn
 * down the same line the ribbon swallows the cable and the view along it. Real
 * resorts do not stack them either — the chair goes up one side of the trees
 * and the run comes down the other.
 *
 * Keyed on the unordered pair, so a lift up and a run down between the same two
 * places are recognised as the pair they are.
 */
export function lateralOf(resort: Resort, link: Link): number {
  const pair = (one: Link) => [one.from, one.to].sort().join('|')
  const sharing = resort.links.filter((other) => pair(other) === pair(link))
  if (sharing.length < 2) return 0

  const index = sharing.indexOf(link)
  return (index - (sharing.length - 1) / 2) * LATERAL
}

/**
 * A point along a link, at `t` from 0 at its start to 1 at its end.
 *
 * The belly is applied vertically with a parabola, which is zero at both ends —
 * so however a link bows in the middle, it still arrives exactly at the places
 * it claims to join. A curve that missed its own endpoints would leave every
 * cable hanging off the side of its pylon.
 */
export function pointAlong(resort: Resort, link: Link, t: number): Vector3 {
  const from = requirePlace(resort, link.from).at
  const to = requirePlace(resort, link.to).at
  const span = from.distanceTo(to)

  const straight = from.clone().lerp(to, t)
  // Both the belly and the sideways set are scaled by a parabola that is zero
  // at each end, so however a link bows it still arrives exactly at the places
  // it claims to join.
  const bow = 4 * t * (1 - t)
  straight.y += bellyOf(link, span) * bow

  const across = new Vector3(-(to.z - from.z), 0, to.x - from.x)
  if (across.lengthSq() > 1e-9) {
    straight.addScaledVector(across.normalize(), lateralOf(resort, link) * bow)
  }
  return straight
}

/** Every place that no travellable link reaches — what the registry is missing. */
export function unreachable(resort: Resort, from: string): Place[] {
  const seen = new Set<string>([from])
  const queue = [from]

  while (queue.length > 0) {
    const at = queue.shift() as string
    for (const link of resort.links) {
      if (!isTravellable(link)) continue
      for (const [tail, head] of [
        [link.from, link.to],
        [link.to, link.from],
      ]) {
        if (tail === at && !seen.has(head)) {
          seen.add(head)
          queue.push(head)
        }
      }
    }
  }

  return resort.places.filter((place) => !seen.has(place.id))
}
