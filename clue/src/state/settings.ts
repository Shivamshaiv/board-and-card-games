import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccessibilitySettings, AnimationSpeed, AudioSettings } from "@/src/ui/types";

interface SettingsState {
  animationSpeed: AnimationSpeed;
  audio: AudioSettings;
  accessibility: AccessibilitySettings;
  tutorialSeen: boolean;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  setAudio: (patch: Partial<AudioSettings>) => void;
  setAccessibility: (patch: Partial<AccessibilitySettings>) => void;
  setTutorialSeen: (seen: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      animationSpeed: "normal",
      audio: { music: 38, ambience: 55, effects: 72, muted: false },
      accessibility: {
        reducedMotion: false,
        highContrast: false,
        assistedNotebook: false,
        quality: "high",
      },
      tutorialSeen: false,
      setAnimationSpeed: (animationSpeed) => set({ animationSpeed }),
      setAudio: (patch) => set((state) => ({ audio: { ...state.audio, ...patch } })),
      setAccessibility: (patch) =>
        set((state) => ({ accessibility: { ...state.accessibility, ...patch } })),
      setTutorialSeen: (tutorialSeen) => set({ tutorialSeen }),
    }),
    {
      name: "gilded-alibi-settings-v1",
      partialize: (state) => ({
        animationSpeed: state.animationSpeed,
        audio: state.audio,
        accessibility: state.accessibility,
        tutorialSeen: state.tutorialSeen,
      }),
    },
  ),
);

