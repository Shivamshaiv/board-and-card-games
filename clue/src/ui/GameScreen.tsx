"use client";
/* eslint-disable @next/next/no-img-element -- tiny optimized local portraits avoid runtime image-proxy overhead */

import { memo } from "react";
import { BookOpen, Camera, PanelsTopLeft as Cards, DoorOpen, Dices, FastForward, Flag, Footprints, Menu, NotebookPen, RotateCcw, Search, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CardHand } from "./CardHand";
import { SUSPECTS } from "./content";

export interface UiPlayer {
  id: string;
  name: string;
  suspectId: string;
  human: boolean;
  eliminated: boolean;
  thinking?: boolean;
}

export interface GameScreenProps {
  board: React.ReactNode;
  players: UiPlayer[];
  activePlayerId: string;
  humanHand: readonly string[];
  turnNumber: number;
  phaseLabel: string;
  roomName?: string;
  dice?: readonly [number, number] | null;
  canRoll: boolean;
  canMove: boolean;
  canSuggest: boolean;
  canPassage: boolean;
  canAccuse: boolean;
  canEndTurn: boolean;
  eventLog: readonly string[];
  notice?: string | null;
  onRoll: () => void;
  onSuggest: () => void;
  onPassage: () => void;
  onAccuse: () => void;
  onEndTurn: () => void;
  onNotebook: () => void;
  onCards: () => void;
  onSettings: () => void;
  onRules: () => void;
  onMenu: () => void;
  onResetCamera: () => void;
  onSkip: () => void;
  onCardInspectChange?: (open: boolean) => void;
}

interface StableHandProps {
  cardIds: readonly string[];
  onInspectChange?: (open: boolean) => void;
}

const StableHand = memo(
  function StableHand({ cardIds, onInspectChange }: StableHandProps) {
    return <CardHand cardIds={cardIds} compact onInspectChange={onInspectChange} />;
  },
  (previous, next) => previous.onInspectChange === next.onInspectChange &&
    previous.cardIds.length === next.cardIds.length &&
    previous.cardIds.every((cardId, index) => cardId === next.cardIds[index]),
);

export const GameScreen = memo(function GameScreen(props: GameScreenProps) {
  const active = props.players.find((player) => player.id === props.activePlayerId);
  return (
    <section className="game-screen" aria-label="Investigation table">
      <div className="board-viewport">{props.board}</div>
      <div className="board-vignette" aria-hidden="true" />

      <header className="game-topbar">
        <button className="round-control" onClick={props.onMenu} aria-label="Open menu"><Menu size={18} /></button>
        <div className="game-brand"><span className="mini-seal">VA</span><div><p>The Gilded Alibi</p><small>Case 01 · Vesper House</small></div></div>
        <div className="turn-rail" aria-label="Turn order">
          {props.players.map((player, index) => {
            const suspect = SUSPECTS.find((item) => item.id === player.suspectId) ?? SUSPECTS[index % SUSPECTS.length];
            const isActive = player.id === props.activePlayerId;
            return (
              <div
                className={`turn-player ${isActive ? "active" : ""} ${player.eliminated ? "eliminated" : ""}`}
                key={player.id}
                aria-current={isActive ? "step" : undefined}
                style={{ "--player-color": suspect.color, "--player-accent": suspect.accent } as React.CSSProperties}
              >
                <span style={{ borderColor: suspect.color }}><img src={suspect.portrait} alt="" /></span>
                <small>{player.human ? "You" : player.name}</small>
                {player.thinking && <i className="thinking-dots" aria-label="Thinking"><b /><b /><b /></i>}
              </div>
            );
          })}
        </div>
        <nav className="game-tools" aria-label="Game tools">
          <button className="round-control" onClick={props.onRules} aria-label="How to play"><BookOpen size={17} /></button>
          <button className="round-control" onClick={props.onSettings} aria-label="Settings"><Settings size={17} /></button>
          <button className="round-control" onClick={props.onResetCamera} aria-label="Reset camera"><Camera size={17} /></button>
        </nav>
      </header>

      <aside className="turn-card" aria-live="polite">
        <p className="eyebrow">Turn {String(props.turnNumber).padStart(2, "0")}</p>
        <h2>{active?.human ? "Your move" : active ? `${active.name}'s move` : "Investigation in progress"}</h2>
        <p>{props.phaseLabel}{props.roomName ? ` · ${props.roomName}` : ""}</p>
        {props.dice && <div className="dice-readout"><span>{props.dice[0]}</span><span>{props.dice[1]}</span><strong>{props.dice[0] + props.dice[1]}</strong></div>}
      </aside>

      <aside className="case-log" aria-label="Recent investigation events">
        <div className="case-log-heading"><Search size={14} /><span>Case log</span></div>
        <ol>{props.eventLog.slice(-4).reverse().map((entry, index) => <li key={`${entry}-${index}`}><i />{entry}</li>)}</ol>
      </aside>

      {!props.canMove && <div className="game-hand-zone"><StableHand cardIds={props.humanHand} onInspectChange={props.onCardInspectChange} /></div>}

      <nav className="action-dock" aria-label="Available actions">
        <button className="dock-tool" style={{ minWidth: "2.65rem" }} onClick={props.onNotebook}><NotebookPen size={19} /><span>Notebook</span><kbd>N</kbd></button>
        <button className="dock-tool" style={{ minWidth: "2.65rem" }} onClick={props.onCards}><Cards size={19} /><span>Cards</span><kbd>C</kbd></button>
        <div className="dock-divider" />
        {props.canPassage && <button className="dock-tool" style={{ minWidth: "2.65rem" }} onClick={props.onPassage} aria-label="Use secret passage"><DoorOpen size={20} /><span>Passage</span></button>}
        {props.canRoll && <button className="action-button primary-action" style={{ minWidth: "clamp(7rem, 26vw, 10.5rem)" }} onClick={props.onRoll}><Dices size={22} /><span><small>Primary action</small>Roll dice</span><kbd>Space</kbd></button>}
        {props.canSuggest && <button className="action-button primary-action" style={{ minWidth: "clamp(7rem, 26vw, 10.5rem)" }} onClick={props.onSuggest}><Search size={20} /><span><small>Test a theory</small>Make suggestion</span><kbd>Space</kbd></button>}
        {props.canEndTurn && <button className="action-button primary-action" style={{ minWidth: "clamp(7rem, 26vw, 10.5rem)" }} onClick={props.onEndTurn}><Footprints size={20} /><span><small>Investigation</small>End turn</span><kbd>Space</kbd></button>}
        <button className="dock-tool" style={{ minWidth: "2.65rem" }} disabled={!props.canAccuse} onClick={props.onAccuse} aria-label="Make an accusation"><Flag size={19} /><span>Accuse</span></button>
      </nav>

      <button className="camera-reset" onClick={props.onResetCamera}><RotateCcw size={15} /> Reset view <kbd>R</kbd></button>
      <button className="skip-button" onClick={props.onSkip}><FastForward size={15} /> Skip animation</button>

      <AnimatePresence>
        {props.notice && <motion.div className="game-notice" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><span className="mini-seal">VA</span>{props.notice}</motion.div>}
      </AnimatePresence>
    </section>
  );
});
