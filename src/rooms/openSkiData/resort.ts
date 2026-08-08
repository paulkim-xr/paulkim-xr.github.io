import { Vector3 } from 'three'

/**
 * What a place on the mountain is.
 *
 * The registry's own vocabulary rather than a generic node: a base area, a
 * station partway up, a summit, a webcam bolted to a pylon. The kind is what
 * the thing *is*, and the room draws each differently, because a registry whose
 * entries all looked the same would not be worth having.
 */
export type PlaceKind = 'base' | 'station' | 'summit' | 'junction' | 'webcam'

export type Place = {
  id: string
  name: string
  kind: PlaceKind
  at: Vector3
}

/**
 * What connects two places.
 *
 * `lift` goes up and `slope` comes down — the two are not interchangeable, and
 * a graph that forgot which was which would let you ski uphill.
 *
 * `unsurveyed` is the third kind and the reason this room exists. An open
 * registry is incomplete by definition: somebody has to go and measure the
 * thing before it is in there. Those edges are drawn, because knowing a run
 * exists and has not been mapped is itself a fact worth holding, but they
 * cannot be travelled.
 */
export type LinkKind = 'lift' | 'slope' | 'unsurveyed'

export type Link = {
  from: string
  to: string
  kind: LinkKind
  name: string
}

export type Resort = {
  places: Place[]
  links: Link[]
}

const place = (
  id: string,
  name: string,
  kind: PlaceKind,
  x: number,
  y: number,
  z: number,
): Place => ({ id, name, kind, at: new Vector3(x, y, z) })

/**
 * One mountain, as the registry would hold it.
 *
 * Written out rather than generated, because that is what the project is: a
 * repository of measured geometry that people edit by hand and send as pull
 * requests. A procedurally generated mountain would be a prettier demo and a
 * worse description of the thing.
 *
 * The gaps are deliberate and are the point. The North Bowl has a way down that
 * nobody has surveyed, and there is a run beyond it that is barely more than a
 * rumour — both drawn, neither traversable.
 */
export function resort(): Resort {
  return {
    places: [
      place('base', 'Base Area', 'base', 0, 0, 11),
      place('gully', 'Gully Junction', 'junction', 7.5, 3.4, 4.5),
      place('mid', 'Mid Station', 'station', -3.6, 5.6, 2.5),
      place('webcam', 'Webcam · Mid', 'webcam', -1.4, 6.4, 1.2),
      place('ridge', 'East Ridge', 'junction', 6.2, 8.2, -1.5),
      place('summit', 'Summit', 'summit', 0.4, 13.2, -7.5),
      place('bowl', 'North Bowl', 'junction', -8.4, 9.4, -3.6),
      place('far', 'Unnamed Couloir', 'junction', -11.5, 4.2, 4.8),
    ],
    links: [
      { from: 'base', to: 'mid', kind: 'lift', name: 'Base Gondola' },
      { from: 'base', to: 'gully', kind: 'lift', name: 'Gully Chair' },
      { from: 'mid', to: 'summit', kind: 'lift', name: 'Summit Chair' },
      { from: 'gully', to: 'ridge', kind: 'lift', name: 'Ridge T-bar' },
      { from: 'mid', to: 'webcam', kind: 'lift', name: 'Service Track' },
      { from: 'summit', to: 'ridge', kind: 'slope', name: 'Cornice' },
      { from: 'summit', to: 'bowl', kind: 'slope', name: 'North Face' },
      { from: 'ridge', to: 'gully', kind: 'slope', name: 'Long Traverse' },
      { from: 'gully', to: 'base', kind: 'slope', name: 'Home Run' },
      { from: 'mid', to: 'base', kind: 'slope', name: 'Nursery' },
      { from: 'bowl', to: 'far', kind: 'unsurveyed', name: 'not yet surveyed' },
      { from: 'far', to: 'base', kind: 'unsurveyed', name: 'not yet surveyed' },
    ],
  }
}

/** Where the viewer starts: at the bottom, looking up at what there is. */
export const ARRIVAL_PLACE = 'base'
