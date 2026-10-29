import { beforeEach, describe, expect, test } from 'bun:test'

import { createMemoryLocalCanvasStore, type LocalCanvasStore } from '@/app/storage/local-store'
import { purgeUnchangedCopies } from '@/app/storage/workspace/source'

let store: LocalCanvasStore

function write(id: string) {
  return store.writeCanvas({
    id,
    providerId: 's3-compatible',
    name: id,
    figBytes: new Uint8Array([1]),
    syncStatus: 'synced'
  })
}

beforeEach(() => {
  store = createMemoryLocalCanvasStore()
})

describe('purging copies deleted from storage', () => {
  test('removes a copy that stayed as it was read', async () => {
    await write('gone')
    await purgeUnchangedCopies(store, await store.listMetas(true), ['gone'])
    expect(await store.getMeta('gone')).toBeNull()
  })

  test('keeps a copy edited while the provider was listed', async () => {
    await write('edited')
    const read = await store.listMetas(true)
    await store.writeCanvas({
      id: 'edited',
      providerId: 's3-compatible',
      name: 'edited',
      figBytes: new Uint8Array([2]),
      syncStatus: 'pending'
    })
    await purgeUnchangedCopies(store, read, ['edited'])
    expect(await store.getMeta('edited')).toMatchObject({ syncStatus: 'pending' })
  })
})
