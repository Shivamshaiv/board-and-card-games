"use client";

import { BookOpen, ChevronRight, Settings, Sparkles } from "lucide-react";
import { motion } from "motion/react";

interface TitleScreenProps {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onRules: () => void;
  onSettings: () => void;
}

export function TitleScreen({ hasSave, onNewGame, onContinue, onRules, onSettings }: TitleScreenProps) {
  return (
    <section className="title-screen" aria-labelledby="game-title">
      <motion.div
        className="title-lockup"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.75, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="brand-seal" aria-hidden="true"><span>VA</span></div>
        <p className="eyebrow">A Vesper House Mystery</p>
        <h1 id="game-title">The Gilded <em>Alibi</em></h1>
        <p className="title-tagline">The mansion remembers everything.</p>
        <p className="title-description">
          Six guests arrived for the unveiling of an impossible clock. Before midnight, its patron was dead.
        </p>
        <nav className="title-menu" aria-label="Main menu">
          {hasSave && (
            <button className="menu-button menu-button-primary" onClick={onContinue}>
              <span><Sparkles size={17} aria-hidden="true" /> Continue Investigation</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
          <button className={hasSave ? "menu-button" : "menu-button menu-button-primary"} onClick={onNewGame}>
            <span>New Investigation</span><ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="menu-button" onClick={onRules}>
            <span><BookOpen size={17} aria-hidden="true" /> How to Play</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="menu-button" onClick={onSettings}>
            <span><Settings size={17} aria-hidden="true" /> Settings</span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </nav>
      </motion.div>
      <div className="title-casefile" aria-hidden="true">
        <span>Case file</span>
        <strong>01</strong>
        <small>Adrian Vesper<br />11:47 PM</small>
      </div>
      <p className="title-footnote">An original deduction mystery · Single player</p>
    </section>
  );
}

