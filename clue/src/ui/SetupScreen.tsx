"use client";
/* eslint-disable @next/next/no-img-element -- optimized local portrait art uses CSS object positioning */

import { ArrowLeft, Check, ChevronRight, Users } from "lucide-react";
import { motion } from "motion/react";
import { SUSPECTS } from "./content";
import type { SetupOptions } from "./types";

interface SetupScreenProps {
  options: SetupOptions;
  onChange: (patch: Partial<SetupOptions>) => void;
  onBack: () => void;
  onBegin: () => void;
}

export function SetupScreen({ options, onChange, onBack, onBegin }: SetupScreenProps) {
  return (
    <section className="setup-screen" aria-labelledby="setup-title">
      <header className="setup-header">
        <button className="text-button" onClick={onBack}><ArrowLeft size={17} /> Main menu</button>
        <div>
          <p className="eyebrow">Private invitation · 14 October 1936</p>
          <h1 id="setup-title">Choose your investigator</h1>
        </div>
        <div className="setup-step">01 <span>/ 01</span></div>
      </header>

      <div className="setup-grid">
        <div className="suspect-selector" role="radiogroup" aria-label="Choose your character">
          {SUSPECTS.map((suspect, index) => {
            const selected = options.humanSuspect === suspect.id;
            return (
              <motion.button
                key={suspect.id}
                className={`suspect-choice ${selected ? "selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ humanSuspect: suspect.id })}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <img src={suspect.portrait} alt="" />
                <span className="suspect-choice-overlay">
                  <span className="suspect-sigil" style={{ background: suspect.color }}>{suspect.sigil}</span>
                  <span><strong>{suspect.name}</strong><small>{suspect.role}</small></span>
                  {selected && <Check className="choice-check" size={19} aria-hidden="true" />}
                </span>
              </motion.button>
            );
          })}
        </div>

        <aside className="setup-ledger">
          <div className="ledger-heading">
            <Users size={18} aria-hidden="true" />
            <div><p className="eyebrow">Investigation party</p><h2>Table settings</h2></div>
          </div>

          <fieldset className="setup-field">
            <legend>Computer opponents</legend>
            <div className="segmented five">
              {([2, 3, 4, 5] as const).map((count) => (
                <button key={count} className={options.opponents === count ? "active" : ""} onClick={() => onChange({ opponents: count })} type="button">{count}</button>
              ))}
            </div>
            <small>{options.opponents + 1} players total</small>
          </fieldset>

          <fieldset className="setup-field">
            <legend>Opponent reasoning</legend>
            <div className="difficulty-options">
              {(["easy", "normal", "hard"] as const).map((difficulty) => (
                <button key={difficulty} type="button" className={options.difficulty === difficulty ? "active" : ""} onClick={() => onChange({ difficulty })}>
                  <span>{difficulty}</span>
                  <small>{difficulty === "easy" ? "Occasional missed implications" : difficulty === "normal" ? "Accurate notes & useful tests" : "Full constraint reasoning"}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-field">
            <legend>Animation speed</legend>
            <div className="segmented">
              {(["cinematic", "normal", "fast"] as const).map((speed) => (
                <button key={speed} className={options.animationSpeed === speed ? "active" : ""} onClick={() => onChange({ animationSpeed: speed })} type="button">{speed}</button>
              ))}
            </div>
          </fieldset>

          <label className="toggle-row" htmlFor="guided-game">
            <span><strong>Guided first game</strong><small>Contextual clues explain each mechanic.</small></span>
            <input id="guided-game" aria-label="Guided first game" type="checkbox" checked={options.tutorial} onChange={(event) => onChange({ tutorial: event.target.checked })} />
            <i aria-hidden="true" />
          </label>

          <button className="primary-button begin-button" onClick={onBegin}>
            Begin investigation <ChevronRight size={18} aria-hidden="true" />
          </button>
          <p className="setup-seed">A unique sealed case will be prepared.</p>
        </aside>
      </div>
    </section>
  );
}
