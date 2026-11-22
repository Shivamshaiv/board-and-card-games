"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Eraser, Search, Star, UserRoundCheck, X } from "lucide-react";
import { ALL_NOTEBOOK_CARDS } from "./content";
import type { NotebookMark } from "./types";

export interface NotebookPlayer {
  id: string;
  label: string;
  initials: string;
  color: string;
}

interface NotebookProps {
  players: NotebookPlayer[];
  mineCardIds?: readonly string[];
  revealedBy?: Readonly<Record<string, string>>;
  marks?: Record<string, NotebookMark>;
  notes?: Record<string, string>;
  onMarksChange?: (marks: Record<string, NotebookMark>) => void;
  onNotesChange?: (notes: Record<string, string>) => void;
}

const quickCycle: NotebookMark[] = ["", "x", "?", "suspect", "owns"];

function markLabel(mark: NotebookMark) {
  if (mark === "x") return "Definitely not here";
  if (mark === "?") return "Possible";
  if (mark === "suspect") return "Suspected";
  if (mark === "owns") return "Believed owner";
  if (mark === "mine") return "In my hand";
  if (mark === "shown") return "Shown to me";
  return "Unknown";
}

export function Notebook({
  players,
  mineCardIds = [],
  revealedBy = {},
  marks: controlledMarks,
  notes: controlledNotes,
  onMarksChange,
  onNotesChange,
}: NotebookProps) {
  const [localMarks, setLocalMarks] = useState<Record<string, NotebookMark>>({});
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [activeCardId, setActiveCardId] = useState(ALL_NOTEBOOK_CARDS[0].id);
  const [menu, setMenu] = useState<{ cardId: string; playerId: string; x: number; y: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const marks = controlledMarks ?? localMarks;
  const notes = controlledNotes ?? localNotes;

  const visibleCards = useMemo(
    () => ALL_NOTEBOOK_CARDS.filter((card) => card.name.toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );
  const displayedCardId = visibleCards.some((card) => card.id === activeCardId)
    ? activeCardId
    : visibleCards[0]?.id ?? activeCardId;

  useEffect(() => {
    if (!menu) return;
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("button")?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [menu]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  function resolvedMark(cardId: string, playerId: string): NotebookMark {
    if (playerId === players[0]?.id && mineCardIds.includes(cardId)) return "mine";
    if (revealedBy[cardId] === playerId) return "shown";
    return marks[`${cardId}:${playerId}`] ?? "";
  }

  function setMark(cardId: string, playerId: string, mark: NotebookMark) {
    if (resolvedMark(cardId, playerId) === "mine" || resolvedMark(cardId, playerId) === "shown") return;
    const key = `${cardId}:${playerId}`;
    const next = { ...marks };
    if (mark) next[key] = mark;
    else delete next[key];
    if (controlledMarks === undefined) setLocalMarks(next);
    onMarksChange?.(next);
  }

  function cycle(cardId: string, playerId: string) {
    const current = resolvedMark(cardId, playerId);
    const next = quickCycle[(quickCycle.indexOf(current) + 1) % quickCycle.length] ?? "";
    setMark(cardId, playerId, next);
  }

  function setNote(value: string) {
    const next = { ...notes };
    if (value) next[displayedCardId] = value;
    else delete next[displayedCardId];
    if (controlledNotes === undefined) setLocalNotes(next);
    onNotesChange?.(next);
  }

  function openMarkMenu(cardId: string, playerId: string, clientX: number, clientY: number, trigger: HTMLButtonElement) {
    const lockedMark = resolvedMark(cardId, playerId);
    if (lockedMark === "mine" || lockedMark === "shown") return;
    menuTriggerRef.current = trigger;
    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds) {
      setMenu({ cardId, playerId, x: 16, y: 80 });
      return;
    }
    setMenu({
      cardId,
      playerId,
      x: Math.max(8, Math.min(clientX - bounds.left, bounds.width - 176)),
      y: Math.max(8, Math.min(clientY - bounds.top, bounds.height - 190)),
    });
  }

  function startLongPress(event: React.PointerEvent<HTMLButtonElement>, cardId: string, playerId: string) {
    if (event.pointerType !== "touch") return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressOriginRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    const trigger = event.currentTarget;
    longPressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = `${cardId}:${playerId}`;
      openMarkMenu(cardId, playerId, rect.left + rect.width / 2, rect.top + rect.height / 2, trigger);
    }, 520);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressOriginRef.current = null;
  }

  function trackLongPress(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = longPressOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancelLongPress();
  }

  function activateMark(cardId: string, playerId: string) {
    const key = `${cardId}:${playerId}`;
    if (suppressClickRef.current === key) {
      suppressClickRef.current = null;
      return;
    }
    cycle(cardId, playerId);
  }

  function chooseMenuMark(mark: NotebookMark) {
    if (!menu) return;
    setMark(menu.cardId, menu.playerId, mark);
    setMenu(null);
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }

  function navigateMarkMenu(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
      return;
    }
    if (event.key === "Tab") {
      setMenu(null);
      return;
    }
    if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...menuRef.current.querySelectorAll<HTMLButtonElement>("button")];
    if (!items.length) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (current + 1) % items.length
          : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className="notebook-shell" ref={shellRef}>
      <aside className="notebook-margin" aria-hidden="true"><span>V</span><i /><span>1936</span></aside>
      <div className="notebook-page">
        <div className="notebook-toolbar">
          <label><Search size={15} aria-hidden="true" /><span className="sr-only">Search cards</span><input value={filter} onChange={(event) => { setFilter(event.target.value); setMenu(null); }} placeholder="Find a card…" /></label>
          <p>Click: cycle · Right-click or long-press: choose</p>
        </div>
        <div className="notebook-table-wrap">
          <table className="notebook-table">
            <thead><tr><th scope="col">Evidence</th>{players.map((player) => <th scope="col" key={player.id}><span style={{ background: player.color }}>{player.initials}</span><small>{player.label}</small></th>)}</tr></thead>
            <tbody>
              {visibleCards.length === 0 && <tr className="notebook-empty"><td colSpan={players.length + 1}>No evidence matches “{filter}”.</td></tr>}
              {(["Suspects", "Weapons", "Rooms"] as const).map((category) => (
                <NotebookCategory
                  key={category}
                  category={category}
                  cards={visibleCards.filter((card) => card.category === category)}
                  players={players}
                  activeCardId={displayedCardId}
                  setActiveCardId={(id) => setActiveCardId(id as typeof activeCardId)}
                  getMark={resolvedMark}
                  cycle={activateMark}
                  openMenu={openMarkMenu}
                  startLongPress={startLongPress}
                  trackLongPress={trackLongPress}
                  cancelLongPress={cancelLongPress}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="notebook-note">
          <label htmlFor="case-note">Margin note · {ALL_NOTEBOOK_CARDS.find((card) => card.id === displayedCardId)?.name}</label>
          <textarea id="case-note" value={notes[displayedCardId] ?? ""} onChange={(event) => setNote(event.target.value)} placeholder="Write a private observation…" />
        </div>
      </div>
      {menu && (
        <div ref={menuRef} className="mark-menu" role="menu" aria-label="Choose notebook mark" tabIndex={-1} onKeyDown={navigateMarkMenu} style={{ left: menu.x, top: menu.y, right: "auto" }}>
          <button role="menuitem" onClick={() => chooseMenuMark("x")}><X size={15} /> Not here</button>
          <button role="menuitem" onClick={() => chooseMenuMark("?")}><CircleHelp size={15} /> Possible</button>
          <button role="menuitem" onClick={() => chooseMenuMark("suspect")}><Star size={15} /> Suspected</button>
          <button role="menuitem" onClick={() => chooseMenuMark("owns")}><UserRoundCheck size={15} /> Believed owner</button>
          <button role="menuitem" onClick={() => chooseMenuMark("")}><Eraser size={15} /> Clear</button>
        </div>
      )}
    </div>
  );
}

interface CategoryProps {
  category: "Suspects" | "Weapons" | "Rooms";
  cards: typeof ALL_NOTEBOOK_CARDS;
  players: NotebookPlayer[];
  activeCardId: string;
  setActiveCardId: (id: string) => void;
  getMark: (cardId: string, playerId: string) => NotebookMark;
  cycle: (cardId: string, playerId: string) => void;
  openMenu: (cardId: string, playerId: string, clientX: number, clientY: number, trigger: HTMLButtonElement) => void;
  startLongPress: (event: React.PointerEvent<HTMLButtonElement>, cardId: string, playerId: string) => void;
  trackLongPress: (event: React.PointerEvent<HTMLButtonElement>) => void;
  cancelLongPress: () => void;
}

function NotebookCategory({ category, cards, players, activeCardId, setActiveCardId, getMark, cycle, openMenu, startLongPress, trackLongPress, cancelLongPress }: CategoryProps) {
  if (cards.length === 0) return null;
  return (
    <>
      <tr className="category-row"><th colSpan={players.length + 1}>{category}</th></tr>
      {cards.map((card) => (
        <tr key={card.id} className={activeCardId === card.id ? "active" : ""}>
          <th scope="row"><button onClick={() => setActiveCardId(card.id)}>{card.name}</button></th>
          {players.map((player) => {
            const mark = getMark(card.id, player.id);
            return (
              <td key={player.id}>
                <button
                  className={`note-mark mark-${mark || "empty"}`}
                  aria-label={`${card.name}, ${player.label}: ${markLabel(mark)}`}
                  onClick={() => cycle(card.id, player.id)}
                  onContextMenu={(event) => { event.preventDefault(); openMenu(card.id, player.id, event.clientX, event.clientY, event.currentTarget); }}
                  onKeyDown={(event) => {
                    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openMenu(card.id, player.id, rect.left + rect.width / 2, rect.top + rect.height / 2, event.currentTarget);
                  }}
                  onPointerDown={(event) => startLongPress(event, card.id, player.id)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerMove={trackLongPress}
                >
                  {mark === "mine" || mark === "shown" ? <Check size={15} /> : mark === "suspect" ? <Star size={14} /> : mark === "owns" ? <UserRoundCheck size={14} /> : mark || "·"}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
