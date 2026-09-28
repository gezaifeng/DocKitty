import { ObjectStore } from './objectStore.js'
import type { Repo } from './repo.js'

export class StorageContext {
  constructor(readonly chunks: ObjectStore, readonly blobs: ObjectStore) {}

  static forRepo(repo: Repo): StorageContext {
    return new StorageContext(new ObjectStore(repo.objectsDir('chunks')), new ObjectStore(repo.objectsDir('blobs')))
  }
}
