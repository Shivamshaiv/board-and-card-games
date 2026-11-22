export const LOCAL_SAVE_SCHEMA_VERSION = 1 as const
export const LOCAL_SAVE_SLOT = 'active' as const

/** One atomic browser record containing everything needed to resume locally. */
export interface LocalSaveRecord<TGame = unknown, TNotebook = unknown, TSettings = unknown> {
  readonly schemaVersion: typeof LOCAL_SAVE_SCHEMA_VERSION
  readonly slot: typeof LOCAL_SAVE_SLOT
  readonly revision: number
  readonly savedAt: string
  readonly game: TGame | null
  readonly notebook: TNotebook
  readonly settings: TSettings
}

export interface LocalSaveSnapshot<TGame = unknown, TNotebook = unknown, TSettings = unknown> {
  readonly revision: number
  readonly game: TGame | null
  readonly notebook: TNotebook
  readonly settings: TSettings
}

export type PersistenceBackendName = 'indexeddb' | 'localstorage' | 'memory'

export interface PersistenceIssue {
  readonly operation: 'load' | 'save' | 'clear' | 'migrate'
  readonly backend?: PersistenceBackendName
  readonly error: unknown
}

export type SaveMigrator<TGame, TNotebook, TSettings> = (
  value: unknown,
) =>
  | LocalSaveRecord<TGame, TNotebook, TSettings>
  | null
  | Promise<LocalSaveRecord<TGame, TNotebook, TSettings> | null>

