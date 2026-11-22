"use client";
/* eslint-disable @next/next/no-img-element -- local, pre-compressed evidence portraits are part of the selector treatment */

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Eye, LockKeyhole, RotateCcw } from "lucide-react";
import { EvidenceCardFace, getEvidenceCard } from "./CardHand";
import { ROOMS, SUSPECTS, WEAPONS, type RoomId, type SuspectId, type WeaponId } from "./content";

interface SuggestionBuilderProps {
  roomId: RoomId;
  onConfirm: (suspectId: SuspectId, weaponId: WeaponId) => boolean | void;
}

export function SuggestionBuilder({ roomId, onConfirm }: SuggestionBuilderProps) {
  const [suspectId, setSuspectId] = useState<SuspectId>(SUSPECTS[0].id);
  const [weaponId, setWeaponId] = useState<WeaponId>(WEAPONS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const room = ROOMS.find((item) => item.id === roomId) ?? ROOMS[0];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const accepted = onConfirm(suspectId, weaponId);
    if (accepted === false) setSubmitting(false);
  }

  return (
    <form className="deduction-builder" onSubmit={submit}>
      <div className="deduction-statement">
        <small>Working theory</small>
        <p className="deduction-sentence">I suspect <strong>{SUSPECTS.find((item) => item.id === suspectId)?.name}</strong>, with the <strong>{WEAPONS.find((item) => item.id === weaponId)?.name}</strong>, in the <strong>{room.name}</strong>.</p>
      </div>
      <div className="selector-columns">
        <SelectorList title="Suspect" items={SUSPECTS} value={suspectId} onChange={(value) => setSuspectId(value as SuspectId)} />
        <SelectorList title="Weapon" items={WEAPONS} value={weaponId} onChange={(value) => setWeaponId(value as WeaponId)} />
      </div>
      <div className="locked-room"><LockKeyhole size={17} /><span><small>Current room · fixed by your location</small>{room.name}</span><b>{room.index}</b></div>
      <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "Testing theory…" : "Test this theory"} <ChevronRight size={18} /></button>
    </form>
  );
}

interface AccusationBuilderProps {
  onConfirm: (suspectId: SuspectId, weaponId: WeaponId, roomId: RoomId) => boolean | void;
}

export function AccusationBuilder({ onConfirm }: AccusationBuilderProps) {
  const [suspectId, setSuspectId] = useState<SuspectId>(SUSPECTS[0].id);
  const [weaponId, setWeaponId] = useState<WeaponId>(WEAPONS[0].id);
  const [roomId, setRoomId] = useState<RoomId>(ROOMS[0].id);
  const [armed, setArmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!armed || submitting) return;
    setSubmitting(true);
    const accepted = onConfirm(suspectId, weaponId, roomId);
    if (accepted === false) setSubmitting(false);
  }

  return (
    <form className="accusation-builder" onSubmit={submit}>
      <div className="warning-banner"><AlertTriangle size={20} /><p><strong>This decision is final.</strong> A wrong accusation removes you from all future turns.</p></div>
      <div className="accusation-selectors">
        <label><span>Who?</span><select value={suspectId} onChange={(event) => setSuspectId(event.target.value as SuspectId)}>{SUSPECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>With what?</span><select value={weaponId} onChange={(event) => setWeaponId(event.target.value as WeaponId)}>{WEAPONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Where?</span><select value={roomId} onChange={(event) => setRoomId(event.target.value as RoomId)}>{ROOMS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <blockquote><small>Statement for the Case File</small>“{SUSPECTS.find((item) => item.id === suspectId)?.name}, with the {WEAPONS.find((item) => item.id === weaponId)?.name}, in the {ROOMS.find((item) => item.id === roomId)?.name}.”</blockquote>
      <label className="confirmation-check"><input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} /><span><Check size={15} /></span>I understand the Case File will judge this accusation.</label>
      <button type="submit" className="primary-button dangerous" disabled={!armed || submitting}>{submitting ? "Opening Case File…" : "Make final accusation"} <ChevronRight size={18} /></button>
    </form>
  );
}

interface SelectorItem {
  id: string;
  name: string;
  portrait?: string;
  art?: string;
  glyph?: string;
  role?: string;
  material?: string;
  color?: string;
  accent?: string;
  sigil?: string;
}

function SelectorList({ title, items, value, onChange }: { title: string; items: readonly SelectorItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset className={`selector-list selector-list-${title.toLowerCase()}`}>
      <legend>{title}</legend>
      {items.map((item, index) => {
        const selected = value === item.id;
        const accent = item.color ?? ["#b66d37", "#78929d", "#765469", "#4b8092", "#9b7040", "#b08b47"][index] ?? "#b68a45";
        return (
          <button
            key={item.id}
            type="button"
            className={selected ? "selected" : ""}
            aria-pressed={selected}
            onClick={() => onChange(item.id)}
            style={{
              "--selector-accent": accent,
              "--selector-highlight": item.accent ?? "#e3c486",
            } as React.CSSProperties}
          >
            <span className="selector-card-art" aria-hidden="true">
              {item.portrait || item.art ? (
                <img src={item.portrait ?? item.art} alt="" width={96} height={88} loading="lazy" decoding="async" />
              ) : <b>{item.glyph}</b>}
              <i>{item.sigil ?? String(index + 1).padStart(2, "0")}</i>
            </span>
            <span><strong>{item.name}</strong><small>{item.role ?? item.material}</small></span>
            <span className="selector-check" aria-hidden="true">{selected ? <Check size={16} /> : <i />}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

export function PrivateReveal({ cardId, from, onAcknowledge }: { cardId: string; from: string; onAcknowledge: () => void }) {
  const card = getEvidenceCard(cardId);
  return (
    <div className="private-reveal">
      <p className="eyebrow"><Eye size={14} /> Private evidence · shown only to you</p>
      <div className="reveal-card-scene">
        <div
          className="reveal-card"
          style={{
            "--card-accent": card.accent,
            "--card-highlight": card.highlight,
          } as React.CSSProperties}
        >
          <span className="reveal-card-front"><EvidenceCardFace id={cardId} card={card} imageLoading="eager" /></span>
        </div>
      </div>
      <div className="reveal-provenance"><small>Revealed by</small><strong>{from}</strong><span>{card.serial} · {card.categoryLabel}</span></div>
      <button type="button" className="primary-button" onClick={onAcknowledge}>Record evidence <ChevronRight size={18} /></button>
    </div>
  );
}

export function CaseResult({
  won,
  solution,
  turns,
  suggestions,
  onNewGame,
  onMainMenu,
}: {
  won: boolean;
  solution?: { suspectId: SuspectId; weaponId: WeaponId; roomId: RoomId };
  turns: number;
  suggestions: number;
  onNewGame: () => void;
  onMainMenu?: () => void;
}) {
  return (
    <div className={`case-result ${won ? "won" : "lost"}`}>
      <div className="case-result-seal">{won ? "✓" : "VA"}</div>
      <p className="eyebrow">Case File · Final determination</p>
      <h3>{won ? "The truth, at last." : "Another investigator found the truth."}</h3>
      {solution && <p className="solution-line"><strong>{SUSPECTS.find((item) => item.id === solution.suspectId)?.name}</strong> used the <strong>{WEAPONS.find((item) => item.id === solution.weaponId)?.name}</strong> in the <strong>{ROOMS.find((item) => item.id === solution.roomId)?.name}</strong>.</p>}
      <div className="case-stats"><span><b>{turns}</b> turns</span><span><b>{suggestions}</b> theories tested</span><span><b>{won ? "Solved" : "Closed"}</b> verdict</span></div>
      <div className="case-result-actions">
        <button type="button" className="primary-button" onClick={onNewGame}>Begin another case <ChevronRight size={18} /></button>
        {onMainMenu && <button type="button" className="text-button" onClick={onMainMenu}><RotateCcw size={16} /> Return to main menu</button>}
      </div>
    </div>
  );
}
