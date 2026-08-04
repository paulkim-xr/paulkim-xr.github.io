import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { BufferGeometry } from 'three'
import { projects } from './projects'
import type { Project } from './schema'
import { papercupShape } from '../shape/shapes/papercup'
import { skiwatchShape } from '../shape/shapes/skiwatch'
import { openSkiDataShape } from '../shape/shapes/openSkiData'
import { projectBetaShape } from '../shape/shapes/projectBeta'
import { boardgameShape } from '../shape/shapes/boardgame'
import { circlesShape } from '../shape/shapes/circles'
import { gravityShape } from '../shape/shapes/gravity'

export type RoomScene = ComponentType<{ room: Room }>

/** A lazy scene that can also be told to start downloading early. */
export type LazyScene = LazyExoticComponent<RoomScene> & {
  preload: () => Promise<unknown>
}

export type Room = Project & {
  /**
   * The single mesh the hub morphs into for this project, and the same object
   * that stands on the plinth once you are inside. A factory, not a shared
   * instance: the hub rewrites vertex positions in place.
   */
  shape: () => BufferGeometry
  /** Line colour for the shape, in the hub and the room alike. */
  accent: string
  /** Mounted behind the void mask. Code-split — absent from the initial bundle. */
  scene: LazyScene
}

function lazyScene(factory: () => Promise<{ default: RoomScene }>): LazyScene {
  return Object.assign(lazy(factory), { preload: factory })
}

/**
 * The exhibit template is every project's floor. Graduating a project to a
 * bespoke room is a one-line change here:
 *
 *   scene: lazyScene(() => import('../rooms/papercup/StringRoom'))
 */
const exhibitScene = () => lazyScene(() => import('../exhibit/Exhibit'))

const bindings: Record<string, Pick<Room, 'shape' | 'accent' | 'scene'>> = {
  papercup: { shape: papercupShape, accent: '#9aa4b2', scene: exhibitScene() },
  skiwatch: { shape: skiwatchShape, accent: '#7fb8ff', scene: exhibitScene() },
  'open-ski-data': { shape: openSkiDataShape, accent: '#8ce0c0', scene: exhibitScene() },
  'project-beta': { shape: projectBetaShape, accent: '#ffb27f', scene: exhibitScene() },
  'cli-p2p-boardgame': { shape: boardgameShape, accent: '#c79aff', scene: exhibitScene() },
  // The lab pieces, presented on the same footing as the projects. Their
  // rooms are the standard exhibit; the piece itself lives at its own route,
  // linked from the panel, because neither belongs inside the hub's canvas.
  circles: { shape: circlesShape, accent: '#ff5fd2', scene: exhibitScene() },
  gravity: { shape: gravityShape, accent: '#7fd4ff', scene: exhibitScene() },
}

export const rooms: Room[] = projects.map((project) => {
  const binding = bindings[project.id]
  if (!binding) {
    throw new Error(`No shape/scene binding registered for project "${project.id}"`)
  }
  return { ...project, ...binding }
})

const indexById = new Map(rooms.map((room, index) => [room.id, index]))

export function getRoom(id: string): Room | undefined {
  const index = indexById.get(id)
  return index === undefined ? undefined : rooms[index]
}

export function roomIndex(id: string): number {
  return indexById.get(id) ?? -1
}
