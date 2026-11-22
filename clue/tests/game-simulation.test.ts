import { describe, expect, it } from "vitest";

import {
  SUSPECTS,
  createGameSession,
  type PlayerGameView,
} from "../src/game";
import {
  decideGameViewAction,
  type AiDifficulty,
  type AiKnowledge,
} from "../src/ai";

interface SimulationResult {
  status: PlayerGameView["status"];
  commands: number;
  transcript: unknown[];
}

function runSimulation(
  playerCount: number,
  difficulty: AiDifficulty,
  seed: string,
  maxCommands = 1_000,
  incrementalEvents = true,
): SimulationResult {
  const playerIds = Array.from({ length: playerCount }, (_, index) => `ai-${index + 1}`);
  const session = createGameSession({
    seed,
    startingPlayerId: playerIds[0],
    players: playerIds.map((id, index) => ({
      id,
      name: `AI ${index + 1}`,
      suspectId: SUSPECTS[index].suspectId,
      kind: "ai" as const,
    })),
  });
  const knowledge = new Map<string, AiKnowledge>();
  const eventCursor = new Map<string, number>();
  const transcript: unknown[] = [];

  for (let commands = 0; commands < maxCommands; commands += 1) {
    const firstView = session.viewFor(playerIds[0]);
    if (firstView.status !== "playing") {
      return { status: firstView.status, commands, transcript };
    }

    const views = playerIds.map((playerId) => session.viewFor(playerId));
    const actor =
      views.find((view) => view.legalActions.includes("CHOOSE_REVEAL")) ??
      views.find((view) => view.viewerId === view.activePlayerId);
    expect(actor, "every playing state must have an actor").toBeDefined();

    const events = session.eventsFor(
      actor!.viewerId,
      incrementalEvents ? eventCursor.get(actor!.viewerId) ?? 0 : 0,
    );
    const result = decideGameViewAction(
      actor!,
      events,
      difficulty,
      knowledge.get(actor!.viewerId),
    );
    eventCursor.set(
      actor!.viewerId,
      events.at(-1)?.sequence ?? eventCursor.get(actor!.viewerId) ?? 0,
    );
    knowledge.set(actor!.viewerId, result.knowledge);
    expect(result.command, "every playing actor must have a legal command").toBeDefined();
    expect(actor!.legalActions).toContain(result.command!.type);

    const beforeRevision = actor!.revision;
    expect(() => session.dispatch(result.command!)).not.toThrow();
    expect(session.viewFor(actor!.viewerId).revision).toBe(beforeRevision + 1);
    transcript.push(result.command);
  }

  return {
    status: session.viewFor(playerIds[0]).status,
    commands: maxCommands,
    transcript,
  };
}

describe("seeded full-game simulations", () => {
  const cases = (["easy", "normal", "hard"] as const).flatMap((difficulty) =>
    [3, 4, 5, 6].flatMap((playerCount) =>
      ["a", "b", "c"].map((seedVariant) => ({
        difficulty,
        playerCount,
        seedVariant,
      })),
    ),
  );

  it.each(cases)(
    "reaches a valid terminal state with $playerCount $difficulty players ($seedVariant)",
    ({ playerCount, difficulty, seedVariant }) => {
      const result = runSimulation(
        playerCount,
        difficulty,
        `full-game-${difficulty}-${playerCount}-${seedVariant}`,
      );
      expect(result.status).toBe("won");
      expect(result.commands).toBeGreaterThan(0);
    },
    20_000,
  );

  it("is deterministic for identical seeds and sanitized observations", () => {
    const first = runSimulation(4, "normal", "repeatable-full-game");
    const second = runSimulation(4, "normal", "repeatable-full-game");
    expect(second.status).toBe(first.status);
    expect(second.transcript).toEqual(first.transcript);
  });

  it("also terminates through the production full-history adapter path", () => {
    const result = runSimulation(4, "hard", "full-history-adapter", 1_000, false);
    expect(result.status).toBe("won");
  });
});
