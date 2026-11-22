"use client";

import { Eye, Gauge, Music2, Volume2, VolumeX } from "lucide-react";
import { useSettings } from "@/src/state/settings";

export function SettingsPanel() {
  const animationSpeed = useSettings((state) => state.animationSpeed);
  const audio = useSettings((state) => state.audio);
  const accessibility = useSettings((state) => state.accessibility);
  const setAnimationSpeed = useSettings((state) => state.setAnimationSpeed);
  const setAudio = useSettings((state) => state.setAudio);
  const setAccessibility = useSettings((state) => state.setAccessibility);

  return (
    <div className="settings-content">
      <section className="settings-section">
        <div className="settings-section-title"><Music2 size={18} /><div><h3>Sound</h3><p>Three independent layers, mixed for your table.</p></div></div>
        <button className={`mute-button ${audio.muted ? "muted" : ""}`} onClick={() => setAudio({ muted: !audio.muted })}>
          {audio.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{audio.muted ? "Sound muted" : "Mute all"}
        </button>
        {(["music", "ambience", "effects"] as const).map((key) => (
          <label className="range-row" key={key}>
            <span>{key}</span>
            <input type="range" min="0" max="100" value={audio[key]} onChange={(event) => setAudio({ [key]: Number(event.target.value) })} />
            <output>{audio[key]}</output>
          </label>
        ))}
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><Gauge size={18} /><div><h3>Presentation</h3><p>Keep the drama, control the pace.</p></div></div>
        <div className="segmented wide">
          {(["cinematic", "normal", "fast"] as const).map((speed) => (
            <button key={speed} className={animationSpeed === speed ? "active" : ""} onClick={() => setAnimationSpeed(speed)}>{speed}</button>
          ))}
        </div>
        <label className="select-row"><span>Visual quality</span><select value={accessibility.quality} onChange={(event) => setAccessibility({ quality: event.target.value as "low" | "medium" | "high" })}><option value="high">High · Desktop</option><option value="medium">Medium · Laptop</option><option value="low">Low · Tablet</option></select></label>
      </section>

      <section className="settings-section">
        <div className="settings-section-title"><Eye size={18} /><div><h3>Accessibility</h3><p>Every clue remains legible without color or motion.</p></div></div>
        <label className="toggle-row compact" htmlFor="reduced-motion"><span><strong>Reduced motion</strong><small>Use cuts and fades instead of camera travel.</small></span><input id="reduced-motion" aria-label="Reduced motion" type="checkbox" checked={accessibility.reducedMotion} onChange={(event) => setAccessibility({ reducedMotion: event.target.checked })} /><i /></label>
        <label className="toggle-row compact" htmlFor="high-contrast"><span><strong>High contrast</strong><small>Strengthen labels, paths, and focus rings.</small></span><input id="high-contrast" aria-label="High contrast" type="checkbox" checked={accessibility.highContrast} onChange={(event) => setAccessibility({ highContrast: event.target.checked })} /><i /></label>
        <label className="toggle-row compact" htmlFor="assisted-notebook"><span><strong>Assisted notebook</strong><small>Surface only deductions your evidence proves.</small></span><input id="assisted-notebook" aria-label="Assisted notebook" type="checkbox" checked={accessibility.assistedNotebook} onChange={(event) => setAccessibility({ assistedNotebook: event.target.checked })} /><i /></label>
      </section>
    </div>
  );
}
