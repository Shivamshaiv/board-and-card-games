"use client";
/* eslint-disable @next/next/no-img-element -- local, pre-compressed portrait art is part of the physical card treatment */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { ROOMS, SUSPECTS, WEAPONS } from "./content";

interface CardHandProps {
  cardIds: readonly string[];
  compact?: boolean;
  onInspectChange?: (open: boolean) => void;
}

export type EvidenceCategory = "suspect" | "weapon" | "room" | "evidence";

export interface EvidenceCardPresentation {
  id: string;
  rawId: string;
  category: EvidenceCategory;
  categoryLabel: string;
  name: string;
  subtitle: string;
  description: string;
  motif: string;
  serial: string;
  accent: string;
  highlight: string;
  image?: string;
  tone?: string;
}

const WEAPON_ACCENTS = ["#b66d37", "#78929d", "#765469", "#4b8092", "#9b7040", "#b08b47"] as const;
const ROOM_ACCENTS: Record<string, string> = {
  blue: "#315f91",
  gold: "#b28a42",
  green: "#3d755d",
  red: "#8e3e48",
  cream: "#aa8c61",
  violet: "#76548e",
  bronze: "#8c653b",
  cedar: "#754737",
  copper: "#a65c37",
};

/** A single source of truth for hand, reveal, and selector card treatments. */
export function getEvidenceCard(id: string): EvidenceCardPresentation {
  const rawId = id.replace(/^suspect-/, "").replace(/^weapon-/, "").replace(/^room-/, "");
  const suspectIndex = SUSPECTS.findIndex((item) => item.id === rawId);
  const suspect = SUSPECTS[suspectIndex];
  if (suspect) {
    return {
      id,
      rawId,
      category: "suspect",
      categoryLabel: "Suspect dossier",
      name: suspect.name,
      subtitle: suspect.role,
      description: suspect.dossier,
      motif: suspect.sigil,
      serial: `S-${String(suspectIndex + 1).padStart(2, "0")}`,
      accent: suspect.color,
      highlight: suspect.accent,
      image: suspect.portrait,
    };
  }

  const weaponIndex = WEAPONS.findIndex((item) => item.id === rawId);
  const weapon = WEAPONS[weaponIndex];
  if (weapon) {
    return {
      id,
      rawId,
      category: "weapon",
      categoryLabel: "Material evidence",
      name: weapon.name,
      subtitle: weapon.material,
      description: `Recovered from Vesper House. Catalogued in ${weapon.material.toLowerCase()}.`,
      motif: weapon.glyph,
      serial: `W-${String(weaponIndex + 1).padStart(2, "0")}`,
      accent: WEAPON_ACCENTS[weaponIndex] ?? "#9d713e",
      highlight: "#e3c486",
      image: weapon.art,
    };
  }

  const roomIndex = ROOMS.findIndex((item) => item.id === rawId);
  const room = ROOMS[roomIndex];
  if (room) {
    return {
      id,
      rawId,
      category: "room",
      categoryLabel: "Scene record",
      name: room.name,
      subtitle: `Vesper House · Room ${room.index}`,
      description: `Architectural record ${room.index}. Search the room, its doors, and every possible route.`,
      motif: room.index,
      serial: `R-${String(roomIndex + 1).padStart(2, "0")}`,
      accent: ROOM_ACCENTS[room.tone] ?? "#2c5d59",
      highlight: "#d5b46d",
      image: room.art,
      tone: room.tone,
    };
  }

  return {
    id,
    rawId,
    category: "evidence",
    categoryLabel: "Uncatalogued evidence",
    name: id,
    subtitle: "Private card",
    description: "An uncatalogued item from the Vesper House investigation.",
    motif: "?",
    serial: "E-00",
    accent: "#5e1f2a",
    highlight: "#d5b46d",
  };
}

export function CardHand({ cardIds, compact = false, onInspectChange }: CardHandProps) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const inspectedCard = openCard ? getEvidenceCard(openCard) : null;

  function inspect(cardId: string | null) {
    setOpenCard(cardId);
    onInspectChange?.(Boolean(cardId));
  }

  const inspectModal = openCard && inspectedCard ? (
    <Modal
      title={inspectedCard.name}
      eyebrow={`${inspectedCard.categoryLabel} · ${inspectedCard.serial}`}
      className="card-inspect-modal"
      onClose={() => inspect(null)}
    >
      <div className="card-inspect-stage">
        <div
          className={`evidence-card evidence-card-${inspectedCard.category} card-large`}
          data-card-id={inspectedCard.rawId}
          style={{
            "--card-color": inspectedCard.accent,
            "--card-accent": inspectedCard.accent,
            "--card-highlight": inspectedCard.highlight,
          } as React.CSSProperties}
        >
          <EvidenceCardFace id={openCard} card={inspectedCard} imageLoading="eager" />
        </div>
        <p className="card-inspect-copy">{inspectedCard.description}</p>
        <button type="button" className="card-close" onClick={() => inspect(null)}>Return to your hand</button>
      </div>
    </Modal>
  ) : null;

  return (
    <>
      <div className={`card-hand ${compact ? "compact" : ""}`} aria-label="Your private evidence cards">
        {cardIds.length === 0 && <p className="empty-hand">No evidence cards in this hand.</p>}
        {cardIds.map((id, index) => {
          const card = getEvidenceCard(id);
          const middle = (cardIds.length - 1) / 2;
          const offset = index - middle;
          return (
            <button
              key={id}
              type="button"
              className={`evidence-card evidence-card-${card.category}`}
              data-card-id={card.rawId}
              onClick={() => inspect(id)}
              aria-label={`Examine ${card.name}, ${card.categoryLabel}`}
              style={{
                "--card-index": index,
                "--card-offset": offset,
                "--card-offset-abs": Math.abs(offset),
                "--card-color": card.accent,
                "--card-accent": card.accent,
                "--card-highlight": card.highlight,
              } as React.CSSProperties}
            >
              <EvidenceCardFace id={id} card={card} compact={compact} imageLoading={compact && index < 3 ? "eager" : "lazy"} />
            </button>
          );
        })}
      </div>

      {inspectModal && typeof document !== "undefined" ? createPortal(inspectModal, document.body) : inspectModal}
    </>
  );
}

interface EvidenceCardFaceProps {
  id: string;
  card?: EvidenceCardPresentation;
  compact?: boolean;
  imageLoading?: "eager" | "lazy";
}

/** Compact hand cards use a shallow DOM; collector details stay in inspect/reveal views. */
export function EvidenceCardFace({ id, card: providedCard, compact = false, imageLoading = "lazy" }: EvidenceCardFaceProps) {
  const card = providedCard ?? getEvidenceCard(id);

  if (compact) {
    return (
      <span
        className={`compact-card-face compact-card-${card.category}`}
        style={{
          "--card-accent": card.accent,
          "--card-highlight": card.highlight,
        } as React.CSSProperties}
      >
        <span className="compact-card-art" aria-hidden="true">
          {card.image ? (
            <img src={card.image} alt="" width={720} height={900} loading={imageLoading} decoding="async" />
          ) : <b>{card.motif}</b>}
        </span>
        <span className="compact-card-copy">
          <small>{card.categoryLabel}</small>
          <strong>{card.name}</strong>
        </span>
        <b className="compact-card-serial" aria-hidden="true">{card.serial}</b>
      </span>
    );
  }

  return (
    <span
      className={`card-face card-${card.category}`}
      data-tone={card.tone}
      style={{
        "--card-accent": card.accent,
        "--card-color": card.accent,
        "--card-highlight": card.highlight,
      } as React.CSSProperties}
    >
      <span className="card-stock-grain" aria-hidden="true" />
      <span className="card-edge" aria-hidden="true" />
      <span className="card-corner card-corner-nw" aria-hidden="true" />
      <span className="card-corner card-corner-ne" aria-hidden="true" />
      <span className="card-category">
        <span>Vesper House</span>
        <b>{card.serial}</b>
      </span>
      <span className={`card-art card-art-${card.category}`}>
        {card.image ? (
          <>
            <img src={card.image} alt="" width={720} height={900} loading={imageLoading} decoding="async" />
            <span className={`card-image-matte card-${card.category}-matte`} aria-hidden="true" />
          </>
        ) : card.category === "room" ? (
          <span className="card-room-study" aria-hidden="true">
            <i className="room-study-window" />
            <i className="room-study-floor" />
            <i className="room-study-door" />
            <b>{card.motif}</b>
          </span>
        ) : (
          <span className="card-object-study" aria-hidden="true">
            <i />
            <b>{card.motif}</b>
            <em>Exhibit</em>
          </span>
        )}
        <span className="card-art-plate">
          <small>{card.categoryLabel}</small>
          <b>{card.motif}</b>
        </span>
      </span>
      <span className="card-caption">
        <small className="card-caption-kicker">Official evidence</small>
        <strong>{card.name}</strong>
        <small>{card.subtitle}</small>
      </span>
      <span className="card-footer" aria-hidden="true">
        <span>Case 01</span>
        <b className="card-crest">VA</b>
        <span>Private</span>
      </span>
      <span className="card-evidence-stamp" aria-hidden="true">Evidence</span>
    </span>
  );
}

export function EvidenceCardBack() {
  return (
    <span className="card-back" aria-hidden="true">
      <span className="card-back-grain" />
      <span className="card-back-frame" />
      <span className="card-back-corners"><i /><i /><i /><i /></span>
      <span className="card-back-medallion"><small>Vesper</small><b>VA</b><small>House</small></span>
      <span className="card-back-case">Case File · 1936</span>
    </span>
  );
}
