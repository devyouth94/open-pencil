import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { recentDocuments, rememberRecentStorageDocument } from '@/app/recent-files'
import { createMemoryLocalCanvasStore, type LocalCanvasStore } from '@/app/storage/local-store'
import { resetLocalCanvasStoreForTests } from '@/app/storage/local-store/store'
import { createMemoryOutbox, getOutbox, resetOutboxForTests } from '@/app/storage/sync'
import { deleteStoredDocument } from '@/app/storage/workspace/delete'
import { onStorageWorkspaceEvent } from '@/app/storage/workspace/events'

const BUCKET = { providerId: 's3-compatible' }
const CLOUD = { providerId: 'cloud', profileId: 'server', containerId: 'workspace' }
const POSTER = { id: 'poster', name: 'Poster', updatedAt: '2026-10-01T00:00:00.000Z' }

let store: LocalCanvasStore

beforeEach(() => {
  store = createMemoryLocalCanvasStore()
  resetLocalCanvasStoreForTests(store)
  resetOutboxForTests(createMemoryOutbox())
})

afterEach(() => {
  resetLocalCanvasStoreForTests()
  resetOutboxForTests()
})

describe('deleting a stored document', () => {
  test('hides it, queues its deletion, and drops it from recent files', async () => {
    await store.writeCanvas({
      id: POSTER.id,
      ...BUCKET,
      name: POSTER.name,
      figBytes: new Uint8Array([1]),
      syncStatus: 'synced'
    })
    rememberRecentStorageDocument({ ...BUCKET, documentId: POSTER.id }, POSTER.name)
    const events: string[] = []
    const stop = onStorageWorkspaceEvent((event) =>
      events.push(`${event.kind}:${event.documentId}`)
    )

    await deleteStoredDocument(POSTER, BUCKET)
    stop()

    expect(await store.listMetas()).toEqual([])
    expect(await getOutbox().list()).toMatchObject([{ canvasId: POSTER.id, type: 'deleteCanvas' }])
    expect(recentDocuments.value.some((document) => document.name === POSTER.name)).toBe(false)
    expect(events).toContain(`changed:${POSTER.id}`)
  })

  test('remembers where a document without a local copy lives, so its deletion reaches it', async () => {
    await deleteStoredDocument(POSTER, CLOUD)

    expect(await store.getMeta(POSTER.id)).toMatchObject({ ...CLOUD, tombstoned: true })
    expect(await getOutbox().list()).toMatchObject([{ canvasId: POSTER.id, type: 'deleteCanvas' }])
  })
})
