import { describe, expect, test } from 'vitest'
import { getRoom, roomIndex, rooms } from '../../../src/content/registry'
import { projects } from '../../../src/content/projects'

describe('room registry', () => {
  test('produces one room per project', () => {
    expect(rooms).toHaveLength(projects.length)
  })

  test('every room carries a preview component', () => {
    for (const room of rooms) {
      expect(typeof room.preview, `${room.id} preview`).toBe('function')
    }
  })

  test('every room carries a lazy scene with a preload hook', () => {
    for (const room of rooms) {
      expect(room.scene, `${room.id} scene`).toBeTruthy()
      expect(typeof room.scene.preload, `${room.id} preload`).toBe('function')
    }
  })

  test('preload resolves to a module with a default export', async () => {
    for (const room of rooms) {
      const loaded = (await room.scene.preload()) as { default?: unknown }
      expect(typeof loaded.default, `${room.id} default export`).toBe('function')
    }
  })

  test('getRoom finds a room by id', () => {
    expect(getRoom('papercup')?.title).toBe('papercup')
  })

  test('getRoom returns undefined for an unknown id', () => {
    expect(getRoom('does-not-exist')).toBeUndefined()
  })

  test('roomIndex returns -1 for an unknown id', () => {
    expect(roomIndex('does-not-exist')).toBe(-1)
  })

  test('roomIndex agrees with the rooms array order', () => {
    rooms.forEach((room, index) => expect(roomIndex(room.id)).toBe(index))
  })
})
