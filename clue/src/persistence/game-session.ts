import {
  restoreGameSession,
  type AuthoritativeGameState,
  type GameSession,
} from '../game'
import type { LocalSaveRecord, LocalSaveSnapshot } from './types'

export type GameSessionSaveSnapshot<TNotebook, TSettings> = LocalSaveSnapshot<
  AuthoritativeGameState,
  TNotebook,
  TSettings
>

/** Privileged persistence boundary; AI code must never call this adapter. */
export function snapshotGameSession<TNotebook, TSettings>(
  session: GameSession | null,
  notebook: TNotebook,
  settings: TSettings,
): GameSessionSaveSnapshot<TNotebook, TSettings> {
  const game = session?.exportState() ?? null
  return {
    revision: game?.revision ?? 0,
    game,
    notebook,
    settings,
  }
}

export function restoreSavedGameSession<TNotebook, TSettings>(
  record: LocalSaveRecord<AuthoritativeGameState, TNotebook, TSettings> | null,
): GameSession | null {
  return record?.game ? restoreGameSession(record.game) : null
}

