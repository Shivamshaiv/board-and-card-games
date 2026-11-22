import type { AuthoritativeGameState, GameCommand } from "../game";

export interface SaveEnvelopeV1<TNotebook = unknown, TPreferences = unknown> {
  readonly schemaVersion: 1;
  readonly contentVersion: "vesper-house-v1";
  readonly engineVersion: 1;
  readonly authoritativeState: AuthoritativeGameState;
  readonly notebook: TNotebook;
  readonly preferences: TPreferences;
  readonly acceptedCommandTranscript: readonly GameCommand[];
  readonly timestamp: string;
}

export function createSaveEnvelopeV1<TNotebook, TPreferences>(input: {
  authoritativeState: AuthoritativeGameState;
  notebook: TNotebook;
  preferences: TPreferences;
  acceptedCommandTranscript?: readonly GameCommand[];
  timestamp?: string;
}): SaveEnvelopeV1<TNotebook, TPreferences> {
  return {
    schemaVersion: 1,
    contentVersion: "vesper-house-v1",
    engineVersion: 1,
    authoritativeState: input.authoritativeState,
    notebook: input.notebook,
    preferences: input.preferences,
    acceptedCommandTranscript: input.acceptedCommandTranscript ?? [],
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}
