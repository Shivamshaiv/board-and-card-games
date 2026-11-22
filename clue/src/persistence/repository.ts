import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { z } from 'zod'
import {
  LOCAL_SAVE_SCHEMA_VERSION,
  LOCAL_SAVE_SLOT,
  type LocalSaveRecord,
  type LocalSaveSnapshot,
  type PersistenceBackendName,
  type PersistenceIssue,
  type SaveMigrator,
} from './types'

const DATABASE_NAME = 'mansion-mystery-local'
const DATABASE_VERSION = 1
const OBJECT_STORE = 'records'
const LOCAL_STORAGE_KEY = 'mansion-mystery:active-save'

interface SaveDatabase extends DBSchema {
  records: {
    key: string
    value: unknown
  }
}

interface StorageBackend {
  readonly name: PersistenceBackendName
  readonly available: boolean
  get(key: string): Promise<unknown | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

const baseEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  slot: z.literal(LOCAL_SAVE_SLOT),
  revision: z.number().int().nonnegative(),
  savedAt: z.string(),
  game: z.unknown().nullable(),
  notebook: z.unknown(),
  settings: z.unknown(),
})

class IndexedDbBackend implements StorageBackend {
  readonly name = 'indexeddb' as const
  readonly available = typeof indexedDB !== 'undefined'
  private databasePromise?: Promise<IDBPDatabase<SaveDatabase>>

  private database(): Promise<IDBPDatabase<SaveDatabase>> {
    if (!this.available) return Promise.reject(new Error('IndexedDB is unavailable'))
    this.databasePromise ??= openDB<SaveDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(OBJECT_STORE)) {
          database.createObjectStore(OBJECT_STORE)
        }
      },
    })
    return this.databasePromise
  }

  async get(key: string): Promise<unknown | undefined> {
    return (await this.database()).get(OBJECT_STORE, key)
  }

  async set(key: string, value: unknown): Promise<void> {
    await (await this.database()).put(OBJECT_STORE, value, key)
  }

  async delete(key: string): Promise<void> {
    await (await this.database()).delete(OBJECT_STORE, key)
  }
}

class LocalStorageBackend implements StorageBackend {
  readonly name = 'localstorage' as const

  get available(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null
    } catch {
      return false
    }
  }

  async get(key: string): Promise<unknown | undefined> {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined
    return JSON.parse(raw) as unknown
  }

  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(key)
  }
}

const memoryRecords = new Map<string, unknown>()

class MemoryBackend implements StorageBackend {
  readonly name = 'memory' as const
  readonly available = true

  async get(key: string): Promise<unknown | undefined> {
    return memoryRecords.get(key)
  }

  async set(key: string, value: unknown): Promise<void> {
    memoryRecords.set(key, value)
  }

  async delete(key: string): Promise<void> {
    memoryRecords.delete(key)
  }
}

class ResilientStorage {
  private readonly backends: StorageBackend[] = [
    new IndexedDbBackend(),
    new LocalStorageBackend(),
    new MemoryBackend(),
  ]
  private readonly disabled = new Set<PersistenceBackendName>()
  private activeIndex = 0

  constructor(private readonly report: (issue: PersistenceIssue) => void) {
    const available = this.backends.findIndex((backend) => backend.available)
    this.activeIndex = available >= 0 ? available : this.backends.length - 1
  }

  get activeName(): PersistenceBackendName {
    return this.backends[this.activeIndex]?.name ?? 'memory'
  }

  private usable(index: number): boolean {
    const backend = this.backends[index]
    return Boolean(backend?.available && !this.disabled.has(backend.name))
  }

  private disable(index: number, operation: PersistenceIssue['operation'], error: unknown): void {
    const backend = this.backends[index]
    if (!backend) return
    this.disabled.add(backend.name)
    this.report({ operation, backend: backend.name, error })
  }

  async get(key: string): Promise<unknown | undefined> {
    let firstUsable = -1
    for (let index = 0; index < this.backends.length; index += 1) {
      if (!this.usable(index)) continue
      if (firstUsable < 0) firstUsable = index
      try {
        const value = await this.backends[index].get(key)
        if (value !== undefined) {
          this.activeIndex = index
          return value
        }
      } catch (error) {
        this.disable(index, 'load', error)
      }
    }
    if (firstUsable >= 0 && this.usable(firstUsable)) this.activeIndex = firstUsable
    return undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    const indices = [
      this.activeIndex,
      ...this.backends.map((_, index) => index).filter((index) => index !== this.activeIndex),
    ]
    for (const index of indices) {
      if (!this.usable(index)) continue
      try {
        await this.backends[index].set(key, value)
        this.activeIndex = index
        return
      } catch (error) {
        this.disable(index, 'save', error)
      }
    }
    throw new Error('No local persistence backend is available')
  }

  async delete(key: string): Promise<void> {
    let succeeded = false
    for (let index = 0; index < this.backends.length; index += 1) {
      if (!this.usable(index)) continue
      try {
        await this.backends[index].delete(key)
        succeeded = true
      } catch (error) {
        this.disable(index, 'clear', error)
      }
    }
    if (!succeeded) throw new Error('No local persistence backend is available')
  }
}

export interface LocalSaveRepositoryOptions<TGame, TNotebook, TSettings> {
  readonly migrate?: SaveMigrator<TGame, TNotebook, TSettings>
  readonly onIssue?: (issue: PersistenceIssue) => void
  readonly now?: () => Date
}

export class LocalSaveRepository<TGame = unknown, TNotebook = unknown, TSettings = unknown> {
  private readonly storage: ResilientStorage
  private readonly migrate?: SaveMigrator<TGame, TNotebook, TSettings>
  private readonly onIssue: (issue: PersistenceIssue) => void
  private readonly now: () => Date
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(options: LocalSaveRepositoryOptions<TGame, TNotebook, TSettings> = {}) {
    this.onIssue = options.onIssue ?? (() => undefined)
    this.storage = new ResilientStorage(this.onIssue)
    this.migrate = options.migrate
    this.now = options.now ?? (() => new Date())
  }

  get backend(): PersistenceBackendName {
    return this.storage.activeName
  }

  async load(): Promise<LocalSaveRecord<TGame, TNotebook, TSettings> | null> {
    await this.writeQueue
    const raw = await this.storage.get(LOCAL_STORAGE_KEY)
    if (raw === undefined) return null

    const version = z.object({ schemaVersion: z.number().int() }).safeParse(raw)
    if (!version.success) {
      this.onIssue({ operation: 'load', backend: this.backend, error: version.error })
      return null
    }

    if (version.data.schemaVersion !== LOCAL_SAVE_SCHEMA_VERSION) {
      if (!this.migrate) {
        this.onIssue({
          operation: 'migrate',
          backend: this.backend,
          error: new Error(`Unsupported save schema ${version.data.schemaVersion}`),
        })
        return null
      }
      try {
        const migrated = await this.migrate(raw)
        if (!migrated) return null
        const parsed = baseEnvelopeSchema.safeParse(migrated)
        if (!parsed.success || parsed.data.schemaVersion !== LOCAL_SAVE_SCHEMA_VERSION) {
          this.onIssue({
            operation: 'migrate',
            backend: this.backend,
            error: parsed.success ? new Error('Migrator returned the wrong version') : parsed.error,
          })
          return null
        }
        await this.storage.set(LOCAL_STORAGE_KEY, migrated)
        return migrated
      } catch (error) {
        this.onIssue({ operation: 'migrate', backend: this.backend, error })
        return null
      }
    }

    const parsed = baseEnvelopeSchema.safeParse(raw)
    if (!parsed.success) {
      this.onIssue({ operation: 'load', backend: this.backend, error: parsed.error })
      return null
    }
    return parsed.data as LocalSaveRecord<TGame, TNotebook, TSettings>
  }

  async save(
    snapshot: LocalSaveSnapshot<TGame, TNotebook, TSettings>,
  ): Promise<LocalSaveRecord<TGame, TNotebook, TSettings>> {
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
      throw new TypeError('Save revision must be a non-negative safe integer')
    }
    const record: LocalSaveRecord<TGame, TNotebook, TSettings> = {
      schemaVersion: LOCAL_SAVE_SCHEMA_VERSION,
      slot: LOCAL_SAVE_SLOT,
      revision: snapshot.revision,
      savedAt: this.now().toISOString(),
      game: snapshot.game,
      notebook: snapshot.notebook,
      settings: snapshot.settings,
    }

    const write = this.writeQueue.then(
      () => this.storage.set(LOCAL_STORAGE_KEY, record),
      () => this.storage.set(LOCAL_STORAGE_KEY, record),
    )
    this.writeQueue = write.catch(() => undefined)
    await write
    return record
  }

  async clear(): Promise<void> {
    const clearing = this.writeQueue.then(
      () => this.storage.delete(LOCAL_STORAGE_KEY),
      () => this.storage.delete(LOCAL_STORAGE_KEY),
    )
    this.writeQueue = clearing.catch(() => undefined)
    await clearing
  }
}

export function createLocalSaveRepository<
  TGame = unknown,
  TNotebook = unknown,
  TSettings = unknown,
>(
  options: LocalSaveRepositoryOptions<TGame, TNotebook, TSettings> = {},
): LocalSaveRepository<TGame, TNotebook, TSettings> {
  return new LocalSaveRepository(options)
}

