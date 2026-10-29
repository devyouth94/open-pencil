import {
  sameStorageDocument,
  storageLocationOf,
  type StorageDocument,
  type StorageDocumentBinding,
  type StorageLocation
} from '@/app/integrations/storage'
import { forgetRecentStorageDocument } from '@/app/recent-files'
import { getLocalCanvasStore } from '@/app/storage/local-store'
import { enqueueDeleteCanvas } from '@/app/storage/sync'
import { emitStorageWorkspaceEvent } from '@/app/storage/workspace/events'
import { closeTab, getTabsSnapshot } from '@/app/tabs'

/**
 * Deletes a stored document for everyone, once the person has confirmed it. Its tabs close without
 * asking, home stops listing it at once, and the provider deletes it when the sync engine reaches
 * the job, so a deletion made offline or refused for now is kept until it goes through.
 */
export async function deleteStoredDocument(
  document: StorageDocument,
  location: StorageLocation
): Promise<void> {
  const binding: StorageDocumentBinding = {
    ...storageLocationOf(location),
    documentId: document.id
  }
  for (const tab of getTabsSnapshot()) {
    const open = tab.store.getStorageBinding()
    if (open && sameStorageDocument(open, binding)) await closeTab(tab.id, 'discard')
  }
  const store = getLocalCanvasStore()
  // The sync engine finds the provider through the device's copy, which home seeds as it lists.
  if (!(await store.getMeta(document.id))) {
    await store.upsertIndexMeta({
      id: document.id,
      ...storageLocationOf(location),
      name: document.name,
      updatedAt: document.updatedAt,
      syncStatus: 'synced',
      lastSyncedAt: document.updatedAt,
      lastSyncError: null,
      remoteRevision: document.revision ?? null
    })
  }
  await store.tombstone(document.id)
  await enqueueDeleteCanvas(document.id)
  forgetRecentStorageDocument(binding)
  emitStorageWorkspaceEvent({
    ...storageLocationOf(location),
    documentId: document.id,
    kind: 'changed'
  })
}
