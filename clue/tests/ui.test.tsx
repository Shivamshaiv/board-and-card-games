import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardHand, EvidenceCardBack, EvidenceCardFace, getEvidenceCard } from "../src/ui/CardHand";
import { AccusationBuilder, PrivateReveal, SuggestionBuilder } from "../src/ui/DeductionPanels";
import { HowToPlay } from "../src/ui/HowToPlay";
import { GameScreen, type GameScreenProps } from "../src/ui/GameScreen";
import { Modal } from "../src/ui/Modal";
import { Notebook } from "../src/ui/Notebook";
import { SetupScreen } from "../src/ui/SetupScreen";
import { TitleScreen } from "../src/ui/TitleScreen";

describe("semantic game controls", () => {
  const gameScreenProps: GameScreenProps = {
    board: <div>Board</div>,
    players: [{ id: "human", name: "You", suspectId: "amara-saye", human: true, eliminated: false }],
    activePlayerId: "human",
    humanHand: ["suspect-amara-saye"],
    turnNumber: 1,
    phaseLabel: "Choose your opening action",
    canRoll: true,
    canMove: false,
    canSuggest: false,
    canPassage: true,
    canAccuse: true,
    canEndTurn: false,
    eventLog: ["The case begins."],
    onRoll: () => undefined,
    onSuggest: () => undefined,
    onPassage: () => undefined,
    onAccuse: () => undefined,
    onEndTurn: () => undefined,
    onNotebook: () => undefined,
    onCards: () => undefined,
    onSettings: () => undefined,
    onRules: () => undefined,
    onMenu: () => undefined,
    onResetCamera: () => undefined,
    onSkip: () => undefined,
  };

  it("renders the branded main menu and resume path", () => {
    const html = renderToStaticMarkup(<TitleScreen hasSave onNewGame={() => undefined} onContinue={() => undefined} onRules={() => undefined} onSettings={() => undefined} />);
    expect(html).toContain("The Gilded");
    expect(html).toContain("Continue Investigation");
    expect(html).toContain("How to Play");
    expect(html).toContain("Settings");
  });

  it("offers all setup counts, difficulties, speeds, and the guided toggle", () => {
    const html = renderToStaticMarkup(<SetupScreen options={{ humanSuspect: "amara-saye", opponents: 3, difficulty: "normal", animationSpeed: "normal", tutorial: true }} onChange={() => undefined} onBack={() => undefined} onBegin={() => undefined} />);
    expect(html).toContain("Computer opponents");
    expect(html).toContain("Opponent reasoning");
    expect(html).toContain("cinematic");
    expect(html).toContain("Guided first game");
    expect((html.match(/role="radio"/g) ?? [])).toHaveLength(6);
  });

  it("renders the notebook as a real evidence table", () => {
    const html = renderToStaticMarkup(<Notebook players={[{ id: "human", label: "You", initials: "AS", color: "#2d6b57" }, { id: "ai-1", label: "Rook", initials: "ER", color: "#61717a" }]} mineCardIds={["amara-saye"]} />);
    expect(html).toContain("<table");
    expect(html).toContain("Suspects");
    expect(html).toContain("Weapons");
    expect(html).toContain("Rooms");
    expect(html).toContain("In my hand");
  });

  it("keeps suggestion and accusation interfaces explicitly separate", () => {
    const suggestion = renderToStaticMarkup(<SuggestionBuilder roomId="lantern-atrium" onConfirm={() => undefined} />);
    const accusation = renderToStaticMarkup(<AccusationBuilder onConfirm={() => undefined} />);
    expect(suggestion).toContain("Current room");
    expect(suggestion).toContain("Test this theory");
    expect(accusation).toContain("This decision is final");
    expect(accusation).toContain("Make final accusation");
  });

  it("renders collector-edition card faces, dedicated artwork, and a real card back", () => {
    const suspect = renderToStaticMarkup(<EvidenceCardFace id="suspect-amara-saye" />);
    const weapon = renderToStaticMarkup(<EvidenceCardFace id="weapon-clockmakers-hammer" />);
    const room = renderToStaticMarkup(<EvidenceCardFace id="room-star-observatory" />);
    const back = renderToStaticMarkup(<EvidenceCardBack />);
    expect(suspect).toContain("card-suspect");
    expect(suspect).toContain("amara-saye-v2.webp");
    expect(suspect).toContain("S-01");
    expect(weapon).toContain("weapon-clockmakers-hammer.webp");
    expect(room).toContain("room-star-observatory.webp");
    expect(back).toContain("card-back-medallion");
    expect(getEvidenceCard("suspect-amara-saye").highlight).toBe("#d79a38");
  });

  it("uses the same premium card system for hands and private reveals", () => {
    const hand = renderToStaticMarkup(<CardHand cardIds={["suspect-amara-saye", "weapon-clockmakers-hammer", "room-star-observatory"]} />);
    const reveal = renderToStaticMarkup(<PrivateReveal cardId="weapon-clockmakers-hammer" from="Elias" onAcknowledge={() => undefined} />);
    expect(hand).toContain("Your private evidence cards");
    expect(hand).toContain("Material evidence");
    expect(reveal).toContain("reveal-card-front");
    expect(reveal).not.toContain("reveal-card-back");
    expect(reveal).toContain('loading="eager"');
    expect(reveal).toContain("Revealed by");
  });

  it("keeps accusation and passage controls available in the compact action dock", () => {
    const html = renderToStaticMarkup(<GameScreen {...gameScreenProps} />);
    expect(html).toContain('aria-label="Make an accusation"');
    expect(html).toContain('aria-label="Use secret passage"');
    expect(html).not.toContain("accusation-tool");
    expect(html).toContain("Your private evidence cards");
  });

  it("removes the animated hand from the board while a destination must be selected", () => {
    const html = renderToStaticMarkup(<GameScreen {...gameScreenProps} canRoll={false} canMove />);
    expect(html).not.toContain("Your private evidence cards");
    expect(html).toContain("Make an accusation");
  });

  it("renders gameplay hands with lightweight, legible compact faces", () => {
    const html = renderToStaticMarkup(<CardHand compact cardIds={["suspect-amara-saye", "weapon-clockmakers-hammer", "room-star-observatory"]} />);
    expect((html.match(/compact-card-face/g) ?? [])).toHaveLength(3);
    expect(html).toContain("Amara Saye");
    expect(html).toContain("Clockmaker’s Hammer");
    expect(html).not.toContain("card-stock-grain");
    expect(html).not.toContain("card-evidence-stamp");
    expect((html.match(/loading="eager"/g) ?? [])).toHaveLength(3);
  });

  it("defers selector artwork decoding until the suggestion chooser is visible", () => {
    const html = renderToStaticMarkup(<SuggestionBuilder roomId="lantern-atrium" onConfirm={() => undefined} />);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="96"');
    expect(html).toContain('height="88"');
  });

  it("can enforce a decision modal without a misleading close control", () => {
    const html = renderToStaticMarkup(<Modal title="Choose One Card" onClose={() => undefined} dismissible={false}><button>Reveal</button></Modal>);
    expect(html).toContain('aria-modal="true"');
    expect(html).not.toContain("Close Choose One Card");
    expect(html).toContain("Reveal");
  });

  it("documents keyboard access and solution-preserving elimination", () => {
    const html = renderToStaticMarkup(<HowToPlay />);
    expect(html).toContain("Space");
    expect(html).toContain("Reset camera");
    expect(html).toContain("Case File stays sealed");
  });
});
