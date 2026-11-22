import type { RoomId, SuspectId, WeaponId } from "./content";

export type Difficulty = "easy" | "normal" | "hard";
export type AnimationSpeed = "cinematic" | "normal" | "fast";
export type Screen = "title" | "setup" | "game";
export type Panel = "none" | "settings" | "rules" | "notebook" | "cards" | "suggestion" | "accusation" | "menu";
export type NotebookMark = "" | "x" | "?" | "suspect" | "mine" | string;

export interface SetupOptions {
  humanSuspect: SuspectId;
  opponents: 2 | 3 | 4 | 5;
  difficulty: Difficulty;
  animationSpeed: AnimationSpeed;
  tutorial: boolean;
}

export interface AudioSettings {
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  assistedNotebook: boolean;
  quality: "low" | "medium" | "high";
}

export interface SuggestionDraft {
  suspectId: SuspectId;
  weaponId: WeaponId;
}

export interface AccusationDraft extends SuggestionDraft {
  roomId: RoomId;
}
