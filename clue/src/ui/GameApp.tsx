"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { BookOpen, ChevronRight, FastForward, LogOut, RotateCcw, Save, ShieldCheck } from "lucide-react";
import {
  CARD_BY_ID,
  MANSION_BOARD,
  createGameSession,
  restoreGameSession,
  roomAtTile,
  type AuthoritativeGameState,
  type GameCommand,
  type GameSession,
  type PlayerGameView,
  type VisibleGameEvent,
} from "@/src/game";
import {
  createAiTurnClient,
  type AiKnowledge,
} from "@/src/ai";
import {
  AutosaveController,
  createLocalSaveRepository,
  type LocalSaveRecord,
} from "@/src/persistence";
import {
  DEFAULT_PIECES,
  DEFAULT_WEAPONS,
  MANSION_ROOMS,
  type CameraPreset,
  type DiceVisualState,
  type PresentationTile,
  type ScenePiece,
  type SceneWeapon,
} from "@/src/presentation";
import { MansionCanvas } from "@/src/three";
import { playCue, syncAudioMix, unlockAudio } from "@/src/audio/sound";
import { useSettings } from "@/src/state/settings";
import { CardHand } from "./CardHand";
import { AccusationBuilder, CaseResult, PrivateReveal, SuggestionBuilder } from "./DeductionPanels";
import { GameScreen } from "./GameScreen";
import { HowToPlay } from "./HowToPlay";
import { Modal } from "./Modal";
import { Notebook, type NotebookPlayer } from "./Notebook";
import { SettingsPanel } from "./SettingsPanel";
import { SetupScreen } from "./SetupScreen";
import { TitleScreen } from "./TitleScreen";
import {
  ROOMS,
  SUSPECTS,
  WEAPONS,
  type RoomId,
  type SuspectId,
  type WeaponId,
} from "./content";
import type { NotebookMark, Panel, Screen, SetupOptions } from "./types";

const HUMAN_ID = "human";

interface NotebookSave {
  marks: Record<string, NotebookMark>;
  notes: Record<string, string>;
}

interface LocalMeta {
  setup: SetupOptions;
}

const repository = createLocalSaveRepository<AuthoritativeGameState, NotebookSave, LocalMeta>();

const DEFAULT_SETUP: SetupOptions = {
  humanSuspect: "amara-saye",
  opponents: 3,
  difficulty: "normal",
  animationSpeed: "normal",
  tutorial: true,
};

const TUTORIAL_STEPS = [
  ["The sealed Case File", "One suspect, one weapon, and one room have been removed from play. Every other card is evidence in someone's hand."],
  ["Your private hand", "These cards cannot be in the Case File. Hover or press C to examine them, then mark them in your notebook."],
  ["Move through the mansion", "Roll two dice. Every glowing tile is legal; focus a destination to preview its exact path and cost."],
  ["Test a theory", "Enter a room and name a suspect and weapon. The current room completes your suggestion automatically."],
  ["Watch the answers", "Players respond clockwise. A pass rules out three cards for that player; a private reveal rules out one card completely."],
  ["Keep your own deductions", "Press N for the leather notebook. Your hand and direct reveals are recorded; everything else is yours to reason out."],
  ["Accuse only when certain", "A wrong accusation ends your active investigation. The actual Case File stays sealed while the other players continue."],
] as const;

function rawCardId(cardId: string) {
  return cardId.replace(/^suspect-/, "").replace(/^weapon-/, "").replace(/^room-/, "");
}

function seedForNewGame() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `vesper-${crypto.randomUUID()}`;
  return `vesper-${Date.now().toString(36)}`;
}

function humanPlayersForSetup(options: SetupOptions) {
  const chosenIndex = SUSPECTS.findIndex((suspect) => suspect.id === options.humanSuspect);
  const ordered = [...SUSPECTS.slice(chosenIndex + 1), ...SUSPECTS.slice(0, chosenIndex)];
  return [
    { id: HUMAN_ID, name: "You", suspectId: options.humanSuspect, kind: "human" as const },
    ...ordered.slice(0, options.opponents).map((suspect, index) => ({
      id: `ai-${index + 1}`,
      name: suspect.shortName,
      suspectId: suspect.id,
      kind: "ai" as const,
    })),
  ];
}

function cardName(cardId: string) {
  return CARD_BY_ID[cardId]?.name ?? cardId;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key] as string : "";
}

function eventDescription(event: VisibleGameEvent, view: PlayerGameView) {
  const name = (id: string) => view.players.find((player) => player.id === id)?.name ?? id;
  const payload = event.payload;
  switch (event.type) {
    case "TURN_STARTED": return `${name(payloadString(payload, "playerId"))} begins a turn.`;
    case "DICE_ROLLED": return `${name(payloadString(payload, "playerId"))} rolled ${String(payload.total ?? "the dice")}.`;
    case "ROOM_ENTERED": return `${name(payloadString(payload, "playerId"))} entered ${ROOMS.find((room) => room.id === payload.roomId)?.name ?? "a room"}.`;
    case "SECRET_PASSAGE_USED": return `${name(payloadString(payload, "playerId"))} used a secret passage.`;
    case "SUGGESTION_MADE": return `${name((payload.suggestion as { suggestorId?: string } | undefined)?.suggestorId ?? "")} tested a theory.`;
    case "PLAYER_PASSED": return `${name(payloadString(payload, "playerId"))} could not disprove.`;
    case "SUGGESTION_DISPROVED": return `${name(payloadString(payload, "responderId"))} disproved the suggestion.`;
    case "NO_ONE_DISPROVED": return "No one could disprove the suggestion.";
    case "PLAYER_ELIMINATED": return `${name(payloadString(payload, "playerId"))} made an incorrect accusation.`;
    case "GAME_ENDED": return payload.outcome === "won" ? `${name(payloadString(payload, "winnerId"))} solved the case.` : "The case ended unsolved.";
    default: return "The investigation advanced.";
  }
}

function cueForEvent(event: VisibleGameEvent) {
  if (event.type === "DICE_ROLLED") return "dice" as const;
  if (event.type === "ROOM_ENTERED") return "door" as const;
  if (event.type === "SECRET_PASSAGE_USED") return "passage" as const;
  if (event.type === "SUGGESTION_MADE") return "suggestion" as const;
  if (event.type === "CARD_REVEALED") return "reveal" as const;
  if (event.type === "ACCUSATION_MADE" || event.type === "PLAYER_ELIMINATED") return "accusation" as const;
  if (event.type === "GAME_ENDED") return "victory" as const;
  if (event.type === "TOKEN_MOVED") return "footstep" as const;
  return null;
}

function eventRoomName(view: PlayerGameView) {
  const active = view.players.find((player) => player.id === view.activePlayerId);
  if (!active) return undefined;
  const roomId = roomAtTile(view.suspectLocations[active.suspectId]);
  return ROOMS.find((room) => room.id === roomId)?.name;
}

/** Keeps a recoverable worker or strategy failure from freezing the table. */
function fallbackAiCommand(view: PlayerGameView): GameCommand | null {
  const legal = new Set(view.legalActions);
  const playerId = view.viewerId;
  const reveal = [...view.revealChoices].sort()[0];
  if (legal.has("CHOOSE_REVEAL") && reveal) return { type: "CHOOSE_REVEAL", playerId, cardId: reveal };
  if (legal.has("USE_SECRET_PASSAGE")) return { type: "USE_SECRET_PASSAGE", playerId };
  if (legal.has("ROLL_DICE")) return { type: "ROLL_DICE", playerId };
  if (legal.has("MOVE_PLAYER")) {
    const destination = [...view.reachableDestinations].sort((left, right) => {
      const leftRoom = roomAtTile(left.tileId) ? 1 : 0;
      const rightRoom = roomAtTile(right.tileId) ? 1 : 0;
      return rightRoom - leftRoom || right.cost - left.cost || left.tileId.localeCompare(right.tileId);
    })[0];
    if (destination) return { type: "MOVE_PLAYER", playerId, destinationId: destination.tileId };
  }
  if (legal.has("MAKE_SUGGESTION")) {
    return {
      type: "MAKE_SUGGESTION",
      playerId,
      suspectId: SUSPECTS[view.revision % SUSPECTS.length].id,
      weaponId: WEAPONS[(view.revision * 3 + 1) % WEAPONS.length].id,
    };
  }
  if (legal.has("DECLINE_SUGGESTION")) return { type: "DECLINE_SUGGESTION", playerId };
  if (legal.has("END_TURN")) return { type: "END_TURN", playerId };
  return null;
}

export default function GameApp() {
  const [screen, setScreen] = useState<Screen>("title");
  const [panel, setPanel] = useState<Panel>("none");
  const [setup, setSetup] = useState<SetupOptions>(DEFAULT_SETUP);
  const [view, setView] = useState<PlayerGameView | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [loadedSave, setLoadedSave] = useState<LocalSaveRecord<AuthoritativeGameState, NotebookSave, LocalMeta> | null>(null);
  const [notebookMarks, setNotebookMarks] = useState<Record<string, NotebookMark>>({});
  const [notebookNotes, setNotebookNotes] = useState<Record<string, string>>({});
  const [eventLog, setEventLog] = useState<string[]>(["Vesper House awaits your arrival."]);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [pathTileIds, setPathTileIds] = useState<string[]>([]);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [diceVisual, setDiceVisual] = useState<DiceVisualState | null>(null);
  const [privateReveal, setPrivateReveal] = useState<{ cardId: string; from: string } | null>(null);
  const [cardInspecting, setCardInspecting] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [resultDismissed, setResultDismissed] = useState(false);
  const sessionRef = useRef<GameSession | null>(null);
  const lastEventSequenceRef = useRef(0);
  const lastHumanRevealCountRef = useRef(0);
  const aiKnowledgeRef = useRef<Record<string, AiKnowledge>>({});
  const aiBusyRef = useRef(false);
  const aiClientRef = useRef<ReturnType<typeof createAiTurnClient> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRef = useRef(new AutosaveController(repository));

  const animationSpeed = useSettings((state) => state.animationSpeed);
  const audio = useSettings((state) => state.audio);
  const accessibility = useSettings((state) => state.accessibility);
  const setAnimationSpeed = useSettings((state) => state.setAnimationSpeed);
  const setTutorialSeen = useSettings((state) => state.setTutorialSeen);
  const tutorialSeen = useSettings((state) => state.tutorialSeen);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  const saveCurrent = useCallback((state: AuthoritativeGameState | null = sessionRef.current?.exportState() ?? null) => {
    if (!state) return;
    autosaveRef.current.schedule({
      revision: state.revision,
      game: state,
      notebook: { marks: notebookMarks, notes: notebookNotes },
      settings: { setup: { ...setup, animationSpeed } },
    });
    setHasSave(true);
  }, [animationSpeed, notebookMarks, notebookNotes, setup]);

  const saveImmediately = useCallback(async (announce = true) => {
    const state = sessionRef.current?.exportState();
    if (!state) return false;
    try {
      await autosaveRef.current.saveNow({
        revision: state.revision,
        game: state,
        notebook: { marks: notebookMarks, notes: notebookNotes },
        settings: { setup: { ...setup, animationSpeed } },
      });
      const record = await repository.load();
      if (record) setLoadedSave(record);
      setHasSave(true);
      if (announce) showNotice("Investigation saved on this device.");
      return true;
    } catch {
      showNotice("The investigation could not be saved. Your current table remains open.");
      return false;
    }
  }, [animationSpeed, notebookMarks, notebookNotes, setup, showNotice]);

  const refreshFromSession = useCallback((sourcePlayerId?: string) => {
    const session = sessionRef.current;
    if (!session) return null;
    const nextView = session.viewFor(HUMAN_ID);
    const events = session.eventsFor(HUMAN_ID, lastEventSequenceRef.current);
    if (events.length) {
      lastEventSequenceRef.current = events[events.length - 1].sequence;
      setEventLog((current) => [...current, ...events.map((event) => eventDescription(event, nextView))].slice(-30));
      events.forEach((event) => {
        const cue = cueForEvent(event);
        if (cue) playCue(cue, audio);
      });
      const rollEvent = [...events].reverse().find((event) => event.type === "DICE_ROLLED");
      if (rollEvent) {
        const dice = rollEvent.payload.dice as [number, number];
        const sourceIsAi = nextView.players.some(
          (player) => player.id === sourcePlayerId && player.kind === "ai",
        );
        const durationMs = accessibility.reducedMotion
          ? 40
          : sourceIsAi
            ? animationSpeed === "cinematic"
              ? 300
              : animationSpeed === "fast"
                ? 40
                : 110
            : animationSpeed === "cinematic"
              ? 1500
              : animationSpeed === "fast"
                ? 420
                : 900;
        setDiceVisual({
          rollKey: `${rollEvent.sequence}-${sourcePlayerId ?? "turn"}`,
          values: [dice[0] as 1 | 2 | 3 | 4 | 5 | 6, dice[1] as 1 | 2 | 3 | 4 | 5 | 6],
          rolling: true,
          durationMs,
        });
      }
    }
    if (nextView.privateReveals.length > lastHumanRevealCountRef.current) {
      const reveal = nextView.privateReveals[nextView.privateReveals.length - 1];
      const from = nextView.players.find((player) => player.id === reveal.fromPlayerId)?.name ?? "an opponent";
      setPrivateReveal({ cardId: reveal.cardId, from });
      setCameraPreset("card-reveal");
    }
    if (nextView.revealChoices.length > 0) {
      setPanel("none");
      setPrivateReveal(null);
      setCardInspecting(false);
    }
    if (nextView.status !== "playing") {
      setPanel("none");
      setPrivateReveal(null);
      setCardInspecting(false);
      setCameraPreset("case-file");
      setResultDismissed(false);
    }
    lastHumanRevealCountRef.current = nextView.privateReveals.length;
    setView(nextView);
    saveCurrent(session.exportState());
    return nextView;
  }, [accessibility.reducedMotion, animationSpeed, audio, saveCurrent]);

  const dispatch = useCallback((command: GameCommand) => {
    const session = sessionRef.current;
    if (!session) return null;
    try {
      session.dispatch({ ...command, expectedRevision: session.viewFor(command.playerId).revision });
      return refreshFromSession(command.playerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That action is not legal now.";
      showNotice(message);
      return null;
    }
  }, [refreshFromSession, showNotice]);

  useEffect(() => {
    const autosave = autosaveRef.current;
    const aiClient = createAiTurnClient();
    aiClientRef.current = aiClient;
    let alive = true;
    void repository.load().then((record) => {
      if (!alive || !record?.game) return;
      setLoadedSave(record);
      setHasSave(true);
    });
    return () => {
      alive = false;
      if (aiClientRef.current === aiClient) aiClientRef.current = null;
      aiClient.dispose();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      void autosave.dispose();
    };
  }, []);

  useEffect(() => {
    if (screen === "game" && sessionRef.current) saveCurrent();
  }, [notebookMarks, notebookNotes, saveCurrent, screen]);

  useEffect(() => {
    syncAudioMix(audio, screen !== "setup");
  }, [audio, screen]);

  const beginGame = useCallback((options: SetupOptions = setup) => {
    unlockAudio();
    setAnimationSpeed(options.animationSpeed);
    setSetup(options);
    const session = createGameSession({
      seed: seedForNewGame(),
      players: humanPlayersForSetup(options),
    });
    const initialView = session.viewFor(HUMAN_ID);
    sessionRef.current = session;
    lastEventSequenceRef.current = 0;
    lastHumanRevealCountRef.current = 0;
    aiKnowledgeRef.current = {};
    setNotebookMarks({});
    setNotebookNotes({});
    setEventLog(["The Case File is sealed. Twenty-one cards are dealt around the table."]);
    setSelectedTileId(null);
    setPathTileIds([]);
    setCameraPreset("overview");
    setCameraRevision((revision) => revision + 1);
    setDiceVisual(null);
    setPrivateReveal(null);
    setCardInspecting(false);
    setTutorialStep(options.tutorial && !tutorialSeen ? 0 : TUTORIAL_STEPS.length);
    setResultDismissed(false);
    setView(initialView);
    setPanel("none");
    setScreen("game");
    setHasSave(true);
    autosaveRef.current.schedule({
      revision: session.exportState().revision,
      game: session.exportState(),
      notebook: { marks: {}, notes: {} },
      settings: { setup: options },
    });
  }, [setAnimationSpeed, setup, tutorialSeen]);

  const continueGame = useCallback(async () => {
    const latestSave = await repository.load() ?? loadedSave;
    if (!latestSave?.game) {
      setScreen("setup");
      return;
    }
    unlockAudio();
    try {
      const session = restoreGameSession(latestSave.game);
      const resumedSetup = latestSave.settings?.setup ?? DEFAULT_SETUP;
      const resumedView = session.viewFor(HUMAN_ID);
      const visibleEvents = session.eventsFor(HUMAN_ID);
      sessionRef.current = session;
      lastEventSequenceRef.current = visibleEvents.at(-1)?.sequence ?? 0;
      lastHumanRevealCountRef.current = resumedView.privateReveals.length;
      aiKnowledgeRef.current = {};
      setSetup(resumedSetup);
      setAnimationSpeed(resumedSetup.animationSpeed);
      setNotebookMarks(latestSave.notebook?.marks ?? {});
      setNotebookNotes(latestSave.notebook?.notes ?? {});
      setEventLog(
        visibleEvents.length
          ? visibleEvents.slice(-12).map((event) => eventDescription(event, resumedView))
          : ["The saved investigation is restored."],
      );
      setSelectedTileId(null);
      setPathTileIds([]);
      setDiceVisual(resumedView.roll ? {
        rollKey: `resume-${resumedView.revision}`,
        values: resumedView.roll.dice as [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6],
        rolling: false,
      } : null);
      setPrivateReveal(null);
      setCardInspecting(false);
      setTutorialStep(TUTORIAL_STEPS.length);
      setResultDismissed(false);
      setView(resumedView);
      setPanel("none");
      setScreen("game");
      showNotice("Investigation restored from this device.");
    } catch {
      setHasSave(false);
      setLoadedSave(null);
      showNotice("That saved case could not be restored. Start a new investigation.");
      setScreen("setup");
    }
  }, [loadedSave, setAnimationSpeed, showNotice]);

  const humanIsActive = Boolean(view && view.activePlayerId === HUMAN_ID);
  const legal = useMemo(() => new Set(view?.legalActions ?? []), [view?.legalActions]);

  const rollDice = useCallback(() => {
    if (!view || !legal.has("ROLL_DICE")) return;
    unlockAudio();
    setCameraPreset("movement");
    const next = dispatch({ type: "ROLL_DICE", playerId: HUMAN_ID });
    const first = next?.reachableDestinations[0];
    if (first) {
      setSelectedTileId(first.tileId);
      setPathTileIds([...first.path]);
    }
  }, [dispatch, legal, view]);

  const moveHuman = useCallback((tileId: string) => {
    if (!view || !legal.has("MOVE_PLAYER")) return;
    const destination = view.reachableDestinations.find((candidate) => candidate.tileId === tileId);
    if (!destination) return;
    setSelectedTileId(tileId);
    setPathTileIds([...destination.path]);
    const next = dispatch({ type: "MOVE_PLAYER", playerId: HUMAN_ID, destinationId: tileId });
    const roomId = roomAtTile(tileId);
    if (roomId) {
      setCameraPreset("room");
      setCameraRevision((revision) => revision + 1);
      showNotice(`You entered ${ROOMS.find((room) => room.id === roomId)?.name ?? "the room"}.`);
    } else if (next) {
      setCameraPreset("movement");
    }
  }, [dispatch, legal, showNotice, view]);

  const hoverDestination = useCallback((tileId: string | null) => {
    if (!tileId || !view) {
      setPathTileIds([]);
      return;
    }
    const destination = view.reachableDestinations.find((candidate) => candidate.tileId === tileId);
    setPathTileIds(destination ? [...destination.path] : []);
  }, [view]);

  const usePassage = useCallback(() => {
    const next = dispatch({ type: "USE_SECRET_PASSAGE", playerId: HUMAN_ID });
    if (next) {
      setCameraPreset("room");
      setCameraRevision((revision) => revision + 1);
    }
  }, [dispatch]);

  const endHumanTurn = useCallback(() => {
    if (legal.has("DECLINE_SUGGESTION")) {
      dispatch({ type: "DECLINE_SUGGESTION", playerId: HUMAN_ID });
    } else if (legal.has("END_TURN")) {
      dispatch({ type: "END_TURN", playerId: HUMAN_ID });
    }
    setSelectedTileId(null);
    setPathTileIds([]);
    setCameraPreset("overview");
  }, [dispatch, legal]);

  const confirmSuggestion = useCallback((suspectId: SuspectId, weaponId: WeaponId) => {
    const next = dispatch({ type: "MAKE_SUGGESTION", playerId: HUMAN_ID, suspectId, weaponId });
    if (!next) return false;
    setPanel("none");
    setCameraPreset("room");
    return true;
  }, [dispatch]);

  const confirmAccusation = useCallback((suspectId: SuspectId, weaponId: WeaponId, roomId: RoomId) => {
    const next = dispatch({ type: "MAKE_ACCUSATION", playerId: HUMAN_ID, suspectId, weaponId, roomId });
    if (!next) return false;
    setPanel("none");
    setCameraPreset("case-file");
    if (next?.status === "playing" && next.players.find((player) => player.id === HUMAN_ID)?.eliminated) {
      showNotice("Incorrect. The Case File stays sealed; you may spectate and still disprove theories.");
    }
    return true;
  }, [dispatch, showNotice]);

  const resetCamera = useCallback(() => {
    setCameraPreset("overview");
    setCameraRevision((revision) => revision + 1);
  }, []);

  const skipPresentation = useCallback(() => {
    setDiceVisual((current) => current ? { ...current, rolling: false, durationMs: 0 } : null);
    setCameraPreset("overview");
    setCameraRevision((revision) => revision + 1);
    showNotice("Presentation skipped. The investigation state is unchanged.");
  }, [showNotice]);

  useEffect(() => {
    if (
      screen !== "game" ||
      !view ||
      view.status !== "playing" ||
      view.revealChoices.length > 0 ||
      panel !== "none" ||
      privateReveal !== null ||
      cardInspecting
    ) return;
    const actingPlayerId = view.phase === "awaiting-reveal" && view.pendingSuggestion?.responderId
      ? view.pendingSuggestion.responderId
      : view.activePlayerId;
    const actingPlayer = view.players.find((player) => player.id === actingPlayerId);
    if (!actingPlayer || actingPlayer.kind !== "ai" || aiBusyRef.current) return;
    aiBusyRef.current = true;
    const delay = accessibility.reducedMotion ? 40 : animationSpeed === "cinematic" ? 360 : animationSpeed === "fast" ? 50 : 140;
    const abortController = new AbortController();
    const timer = window.setTimeout(() => { void (async () => {
      const session = sessionRef.current;
      try {
        const aiClient = aiClientRef.current;
        if (!session || !aiClient) return;
        const aiView = session.viewFor(actingPlayer.id);
        const result = await aiClient.decide({
          view: aiView,
          visibleEvents: session.eventsFor(actingPlayer.id),
          difficulty: setup.difficulty,
          previousKnowledge: aiKnowledgeRef.current[actingPlayer.id],
        }, { signal: abortController.signal });
        if (abortController.signal.aborted || sessionRef.current !== session) return;
        aiKnowledgeRef.current[actingPlayer.id] = result.knowledge;
        const command = result.command ?? fallbackAiCommand(aiView);
        if (command) {
          if (command.type === "MOVE_PLAYER") {
            const destination = aiView.reachableDestinations.find((item) => item.tileId === command.destinationId);
            if (destination) setPathTileIds([...destination.path]);
          }
          const next = dispatch(command);
          if (!next && result.command) {
            const liveView = session.viewFor(actingPlayer.id);
            const recovery = fallbackAiCommand(liveView);
            if (recovery && JSON.stringify(recovery) !== JSON.stringify(command)) dispatch(recovery);
          }
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          if (abortController.signal.aborted) return;
          const liveSession = sessionRef.current;
          const liveView = liveSession?.viewFor(actingPlayer.id);
          const recovery = liveView ? fallbackAiCommand(liveView) : null;
          if (recovery) dispatch(recovery);
          else showNotice("An investigator paused unexpectedly. Open the case menu and resume to retry.");
        }
      } finally {
        aiBusyRef.current = false;
      }
    })(); }, delay);
    return () => {
      window.clearTimeout(timer);
      abortController.abort();
      aiBusyRef.current = false;
    };
  }, [accessibility.reducedMotion, animationSpeed, cardInspecting, dispatch, panel, privateReveal, screen, setup.difficulty, showNotice, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        if (panel !== "none") setPanel("none");
        else if (setup.tutorial && tutorialStep < TUTORIAL_STEPS.length) {
          setTutorialStep(TUTORIAL_STEPS.length);
          setTutorialSeen(true);
        }
        return;
      }
      if (screen !== "game") return;
      if (
        panel !== "none" ||
        privateReveal !== null ||
        cardInspecting ||
        Boolean(view && (view.revealChoices.length > 0 || view.status !== "playing"))
      ) return;
      const key = event.key.toLowerCase();
      if (key === "n") setPanel("notebook");
      else if (key === "c") setPanel("cards");
      else if (key === "r") resetCamera();
      else if (event.code === "Space" && humanIsActive) {
        if (target?.closest("button, a, [role='button']")) return;
        event.preventDefault();
        if (legal.has("MAKE_SUGGESTION")) setPanel("suggestion");
        else if (legal.has("ROLL_DICE")) rollDice();
        else if (legal.has("DECLINE_SUGGESTION") || legal.has("END_TURN")) endHumanTurn();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cardInspecting, endHumanTurn, humanIsActive, legal, panel, privateReveal, resetCamera, rollDice, screen, setTutorialSeen, setup.tutorial, tutorialStep, view]);

  const sceneTiles = useMemo<PresentationTile[]>(() => Object.values(MANSION_BOARD.tiles).map((tile) => {
    const authoredRoom = tile.roomId ? MANSION_ROOMS.find((room) => room.id === tile.roomId) : undefined;
    return {
      id: tile.id,
      position: authoredRoom?.position ?? [Number((-10 + (tile.x / Math.max(1, MANSION_BOARD.width - 1)) * 20).toFixed(3)), Number((-8 + (tile.z / Math.max(1, MANSION_BOARD.height - 1)) * 16).toFixed(3))],
      kind: tile.kind === "room" ? "room" : tile.doorwayFor.length ? "doorway" : "corridor",
      ...(tile.roomId ? { roomId: tile.roomId as RoomId } : {}),
    };
  }), []);

  const scenePieces = useMemo<ScenePiece[]>(() => {
    if (!view) return [...DEFAULT_PIECES];
    return SUSPECTS.map((suspect, index) => {
      const tileId = view.suspectLocations[suspect.id];
      const player = view.players.find((candidate) => candidate.suspectId === suspect.id);
      const fallback = DEFAULT_PIECES[index];
      return {
        id: suspect.id,
        suspect: suspect.id,
        ...(tileId ? { tileId } : { position: fallback.position }),
        active: player?.id === view.activePlayerId,
        selected: player?.id === HUMAN_ID,
        eliminated: player?.eliminated ?? false,
      };
    });
  }, [view]);

  const sceneWeapons = useMemo<SceneWeapon[]>(() => {
    if (!view) return [...DEFAULT_WEAPONS];
    return WEAPONS.map((weapon) => ({
      id: weapon.id,
      weapon: weapon.id,
      roomId: view.weaponLocations[weapon.id] as RoomId,
    }));
  }, [view]);

  const activeRoomId = useMemo(() => {
    if (!view) return null;
    const player = view.players.find((candidate) => candidate.id === view.activePlayerId);
    return player ? (roomAtTile(view.suspectLocations[player.suspectId]) as RoomId | undefined) ?? null : null;
  }, [view]);

  const occupiedTileIds = useMemo(() => {
    if (!view) return [];
    return Object.values(view.suspectLocations).filter((tileId): tileId is string => Boolean(tileId && MANSION_BOARD.tiles[tileId]?.kind === "corridor"));
  }, [view]);

  const reachableTileIds = useMemo(
    () => view?.reachableDestinations.map((destination) => destination.tileId) ?? [],
    [view],
  );

  const notebookPlayers = useMemo<NotebookPlayer[]>(() => (view?.players ?? []).map((player, index) => {
    const suspect = SUSPECTS.find((item) => item.id === player.suspectId) ?? SUSPECTS[index % SUSPECTS.length];
    return {
      id: player.id,
      label: player.id === HUMAN_ID ? "You" : player.name,
      initials: suspect.sigil,
      color: suspect.color,
    };
  }), [view]);

  const screenPlayers = useMemo(() => {
    if (!view) return [];
    return view.players.map((player) => ({
      id: player.id,
      name: player.name,
      suspectId: player.suspectId,
      human: player.id === HUMAN_ID,
      eliminated: player.eliminated,
      thinking: player.kind === "ai" && view.revealChoices.length === 0 && player.id === (view.phase === "awaiting-reveal" ? view.pendingSuggestion?.responderId : view.activePlayerId),
    }));
  }, [view]);

  const revealedBy = useMemo(() => Object.fromEntries((view?.privateReveals ?? []).map((reveal) => [rawCardId(reveal.cardId), reveal.fromPlayerId])), [view]);
  const currentHumanRoom = view
    ? roomAtTile(view.suspectLocations[view.players.find((player) => player.id === HUMAN_ID)?.suspectId ?? ""])
    : undefined;
  const humanEliminated = view?.players.find((player) => player.id === HUMAN_ID)?.eliminated ?? false;
  const phaseLabel = humanEliminated
    ? "Spectating · you still answer when able"
    : view?.phase === "awaiting-action" ? "Choose your opening action"
      : view?.phase === "awaiting-move" ? "Choose any highlighted destination"
        : view?.phase === "awaiting-suggestion" ? "Test a theory in this room"
          : view?.phase === "awaiting-reveal" ? "Waiting for private evidence"
            : view?.phase === "awaiting-turn-end" ? "Conclude this turn"
              : "Case concluded";

  const settleDice = useCallback((settledRollKey: string | number) => {
    setDiceVisual((current) =>
      current && current.rollKey === settledRollKey
        ? { ...current, rolling: false }
        : current,
    );
  }, []);

  const selectRoom = useCallback((roomId: RoomId) => {
    const roomTile = MANSION_BOARD.roomTiles[roomId];
    if (roomTile) moveHuman(roomTile);
  }, [moveHuman]);

  const board = useMemo(() => view ? (
    <>
      <MansionCanvas
        tiles={sceneTiles}
        pieces={scenePieces}
        weapons={sceneWeapons}
        reachableTileIds={reachableTileIds}
        pathTileIds={pathTileIds}
        occupiedTileIds={occupiedTileIds}
        selectedTileId={selectedTileId}
        activeRoomId={activeRoomId}
        camera={{ preset: cameraPreset, roomId: activeRoomId ?? undefined, revision: cameraRevision }}
        dice={diceVisual}
        quality={accessibility.quality}
        reducedMotion={accessibility.reducedMotion}
        onTileHover={hoverDestination}
        onTileSelect={moveHuman}
        onRoomSelect={selectRoom}
        onDiceSettled={settleDice}
      />
      {legal.has("MOVE_PLAYER") && humanIsActive && (
        <form className="legal-destinations" onSubmit={(event) => { event.preventDefault(); if (selectedTileId) moveHuman(selectedTileId); }}>
          <label htmlFor="legal-destination">Keyboard destination</label>
          <select id="legal-destination" value={selectedTileId ?? ""} onChange={(event) => { setSelectedTileId(event.target.value); hoverDestination(event.target.value); }}>
            <option value="" disabled>Choose a legal tile…</option>
            {view.reachableDestinations.map((destination) => {
              const tile = MANSION_BOARD.tiles[destination.tileId];
              const room = tile.roomId ? ROOMS.find((item) => item.id === tile.roomId)?.name : undefined;
              return <option key={destination.tileId} value={destination.tileId}>{room ?? `Corridor ${tile.x + 1}, ${tile.z + 1}`} · {destination.cost} step{destination.cost === 1 ? "" : "s"}</option>;
            })}
          </select>
          <button type="submit" disabled={!selectedTileId}>Move</button>
        </form>
      )}
    </>
  ) : null, [
    accessibility.quality,
    accessibility.reducedMotion,
    activeRoomId,
    cameraPreset,
    cameraRevision,
    diceVisual,
    hoverDestination,
    humanIsActive,
    legal,
    moveHuman,
    occupiedTileIds,
    pathTileIds,
    reachableTileIds,
    scenePieces,
    sceneTiles,
    sceneWeapons,
    selectedTileId,
    selectRoom,
    settleDice,
    view,
  ]);

  const closePanel = useCallback(() => setPanel("none"), []);
  const openSuggestion = useCallback(() => setPanel("suggestion"), []);
  const openAccusation = useCallback(() => setPanel("accusation"), []);
  const openNotebook = useCallback(() => setPanel("notebook"), []);
  const openCards = useCallback(() => setPanel("cards"), []);
  const openSettings = useCallback(() => setPanel("settings"), []);
  const openRules = useCallback(() => setPanel("rules"), []);
  const openMenu = useCallback(() => setPanel("menu"), []);
  const skipAndResume = useCallback(() => {
    skipPresentation();
    setPanel("none");
  }, [skipPresentation]);
  const sceneBackdrop = (
    <div className="app-canvas" aria-hidden="true">
      <MansionCanvas
        pieces={DEFAULT_PIECES}
        weapons={DEFAULT_WEAPONS}
        camera={{ preset: "overview", revision: cameraRevision }}
        quality={accessibility.quality}
        reducedMotion={accessibility.reducedMotion}
        enableCameraInput={false}
      />
    </div>
  );

  return (
    <main className={`app-root ${accessibility.highContrast ? "high-contrast" : ""} ${accessibility.reducedMotion ? "reduced-motion" : ""}`}>
      {screen === "title" && sceneBackdrop}
      {screen === "title" && (
        <TitleScreen
          hasSave={hasSave}
          onNewGame={() => setScreen("setup")}
          onContinue={continueGame}
          onRules={() => setPanel("rules")}
          onSettings={() => setPanel("settings")}
        />
      )}
      {screen === "setup" && (
        <SetupScreen
          options={setup}
          onChange={(patch) => setSetup((current) => ({ ...current, ...patch }))}
          onBack={() => setScreen("title")}
          onBegin={() => beginGame(setup)}
        />
      )}
      {screen === "game" && view && (
        <GameScreen
          board={board}
          players={screenPlayers}
          activePlayerId={view.activePlayerId}
          humanHand={view.ownHand}
          turnNumber={view.turnNumber}
          phaseLabel={phaseLabel}
          roomName={eventRoomName(view)}
          dice={view.roll?.dice ?? null}
          canRoll={humanIsActive && legal.has("ROLL_DICE")}
          canMove={humanIsActive && legal.has("MOVE_PLAYER")}
          canSuggest={humanIsActive && legal.has("MAKE_SUGGESTION")}
          canPassage={humanIsActive && legal.has("USE_SECRET_PASSAGE")}
          canAccuse={humanIsActive && legal.has("MAKE_ACCUSATION")}
          canEndTurn={humanIsActive && (legal.has("END_TURN") || legal.has("DECLINE_SUGGESTION"))}
          eventLog={eventLog}
          notice={notice}
          onRoll={rollDice}
          onSuggest={openSuggestion}
          onPassage={usePassage}
          onAccuse={openAccusation}
          onEndTurn={endHumanTurn}
          onNotebook={openNotebook}
          onCards={openCards}
          onSettings={openSettings}
          onRules={openRules}
          onMenu={openMenu}
          onResetCamera={resetCamera}
          onSkip={skipPresentation}
          onCardInspectChange={setCardInspecting}
        />
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{notice ?? eventLog.at(-1)}</div>

      <AnimatePresence>
        {panel === "settings" && <Modal key="settings" title="Settings" eyebrow="Vesper House controls" onClose={closePanel}><SettingsPanel /></Modal>}
        {panel === "rules" && <Modal key="rules" title="How to Play" eyebrow="Investigator's primer" onClose={closePanel} className="wide"><HowToPlay /></Modal>}
        {panel === "cards" && view && <Modal key="cards" title="Your Evidence" eyebrow="Private hand · shown only to you" onClose={closePanel} className="wide"><div className="full-hand"><CardHand cardIds={view.ownHand} /></div></Modal>}
        {panel === "notebook" && view && (
          <Modal key="notebook" title="Investigator's Notebook" eyebrow="Private deductions" onClose={closePanel} className="journal-modal">
            <Notebook
              players={notebookPlayers}
              mineCardIds={view.ownHand.map(rawCardId)}
              revealedBy={revealedBy}
              marks={notebookMarks}
              notes={notebookNotes}
              onMarksChange={setNotebookMarks}
              onNotesChange={setNotebookNotes}
            />
          </Modal>
        )}
        {panel === "suggestion" && currentHumanRoom && (
          <Modal key="suggestion" title="Test a Theory" eyebrow="Suggestion · this is not an accusation" onClose={closePanel} className="suggestion-modal">
            <SuggestionBuilder roomId={currentHumanRoom as RoomId} onConfirm={confirmSuggestion} />
          </Modal>
        )}
        {panel === "accusation" && (
          <Modal key="accusation" title="Make an Accusation" eyebrow="Final decision" onClose={closePanel}>
            <AccusationBuilder onConfirm={confirmAccusation} />
          </Modal>
        )}
        {panel === "menu" && (
          <Modal key="menu" title="Investigation Paused" eyebrow="Case 01 · Vesper House" onClose={closePanel}>
            <div className="pause-menu">
              <button className="menu-button menu-button-primary" onClick={closePanel}><span><ChevronRight size={17} /> Resume investigation</span></button>
              <button className="menu-button" onClick={() => { void saveImmediately(); }}><span><Save size={17} /> Save now</span></button>
              <button className="menu-button" onClick={skipAndResume}><span><FastForward size={17} /> Skip current presentation</span></button>
              <button className="menu-button" onClick={() => setPanel("rules")}><span><BookOpen size={17} /> How to play</span></button>
              <button className="menu-button" onClick={() => setPanel("settings")}><span><ShieldCheck size={17} /> Settings & accessibility</span></button>
              <button className="menu-button" onClick={() => { setSetup((current) => ({ ...current, animationSpeed })); setPanel("none"); setScreen("setup"); }}><span><RotateCcw size={17} /> New investigation</span></button>
              <button className="menu-button" onClick={() => { void (async () => { await saveImmediately(false); setPanel("none"); setScreen("title"); })(); }}><span><LogOut size={17} /> Main menu</span></button>
            </div>
          </Modal>
        )}
        {privateReveal && (
          <Modal key="private-reveal" title="Private Evidence" eyebrow="Shielded reveal" onClose={() => { setPrivateReveal(null); setCameraPreset("overview"); }}>
            <PrivateReveal cardId={privateReveal.cardId} from={privateReveal.from} onAcknowledge={() => { setPrivateReveal(null); setCameraPreset("overview"); }} />
          </Modal>
        )}
        {view && view.revealChoices.length > 0 && (
          <Modal key="reveal-choice" title="Choose One Card" eyebrow="Private response · only the suggester will see it" onClose={() => undefined} dismissible={false}>
            <div className="reveal-choice-list">
              {view.revealChoices.map((cardId) => <button className="menu-button" key={cardId} onClick={() => dispatch({ type: "CHOOSE_REVEAL", playerId: HUMAN_ID, cardId })}><span>{cardName(cardId)}</span><ChevronRight size={17} /></button>)}
            </div>
          </Modal>
        )}
        {view && view.status !== "playing" && !resultDismissed && (
          <Modal key="case-result" title="Case File" eyebrow="Final determination" onClose={() => undefined} dismissible={false}>
            <CaseResult
              won={view.winnerId === HUMAN_ID}
              solution={view.caseFile as { suspectId: SuspectId; weaponId: WeaponId; roomId: RoomId } | undefined}
              turns={view.turnNumber}
              suggestions={eventLog.filter((entry) => entry.includes("tested a theory")).length}
              onNewGame={() => { setSetup((current) => ({ ...current, animationSpeed })); setResultDismissed(true); setScreen("setup"); }}
              onMainMenu={() => { setResultDismissed(true); setScreen("title"); }}
            />
          </Modal>
        )}
      </AnimatePresence>

      {screen === "game" && view?.status === "playing" && panel === "none" && !privateReveal && view.revealChoices.length === 0 && setup.tutorial && tutorialStep < TUTORIAL_STEPS.length && (
        <aside className="tutorial-callout" aria-live="polite">
          <p className="eyebrow">Guided case · {tutorialStep + 1} of {TUTORIAL_STEPS.length}</p>
          <h3>{TUTORIAL_STEPS[tutorialStep][0]}</h3>
          <p>{TUTORIAL_STEPS[tutorialStep][1]}</p>
          <div className="tutorial-actions">
            <div className="tutorial-dots" aria-hidden="true">{TUTORIAL_STEPS.map((_, index) => <i key={index} className={index === tutorialStep ? "active" : ""} />)}</div>
            <div>
              <button onClick={() => { setTutorialStep(TUTORIAL_STEPS.length); setTutorialSeen(true); }}>Dismiss</button>
              <button onClick={() => { const next = tutorialStep + 1; setTutorialStep(next); if (next >= TUTORIAL_STEPS.length) setTutorialSeen(true); }}>{tutorialStep === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </aside>
      )}
      {!accessibility.reducedMotion && <div className="ambient-noise" aria-hidden="true" />}
    </main>
  );
}
