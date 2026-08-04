import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { projects } from './projects'
import type { Project } from './schema'
import { PapercupPreview } from '../hub/previews/PapercupPreview'
import { SkiWatchPreview } from '../hub/previews/SkiWatchPreview'
import { OpenSkiDataPreview } from '../hub/previews/OpenSkiDataPreview'
import { ProjectBetaPreview } from '../hub/previews/ProjectBetaPreview'
import { BoardgamePreview } from '../hub/previews/BoardgamePreview'

export type RoomScene = ComponentType<{ room: Room }>

/** A lazy scene that can also be told to start downloading early. */
export type LazyScene = LazyExoticComponent<RoomScene> & {
  preload: () => Promise<unknown>
}

export type Room = Project & {
  /** Mounted by the carousel. Always resident, so keep it cheap. */
  preview: ComponentType<{ selected: boolean }>
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

const bindings: Record<string, Pick<Room, 'preview' | 'scene'>> = {
  papercup: { preview: PapercupPreview, scene: exhibitScene() },
  skiwatch: { preview: SkiWatchPreview, scene: exhibitScene() },
  'open-ski-data': { preview: OpenSkiDataPreview, scene: exhibitScene() },
  'project-beta': { preview: ProjectBetaPreview, scene: exhibitScene() },
  'cli-p2p-boardgame': { preview: BoardgamePreview, scene: exhibitScene() },
}

export const rooms: Room[] = projects.map((project) => {
  const binding = bindings[project.id]
  if (!binding) {
    throw new Error(`No preview/scene binding registered for project "${project.id}"`)
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
