import type {
  CardId,
  GameCard,
  RoomCard,
  RoomId,
  SuspectCard,
  SuspectId,
  WeaponCard,
  WeaponId,
} from "./types";

export const SUSPECTS = [
  {
    id: "suspect-amara-saye",
    kind: "suspect",
    suspectId: "amara-saye",
    name: "Dr. Amara Saye",
    title: "Botanical Chemist",
    color: "#2d6b57",
  },
  {
    id: "suspect-elias-rook",
    kind: "suspect",
    suspectId: "elias-rook",
    name: "Elias Rook",
    title: "Estate Architect",
    color: "#61717a",
  },
  {
    id: "suspect-celeste-maren",
    kind: "suspect",
    suspectId: "celeste-maren",
    name: "Celeste Maren",
    title: "Illusion Designer",
    color: "#75558f",
  },
  {
    id: "suspect-inez-calder",
    kind: "suspect",
    suspectId: "inez-calder",
    name: "Inez Calder",
    title: "Aviator & Shipping Heir",
    color: "#c68b35",
  },
  {
    id: "suspect-mateo-vale",
    kind: "suspect",
    suspectId: "mateo-vale",
    name: "Mateo Vale",
    title: "Investigative Columnist",
    color: "#315d8f",
  },
  {
    id: "suspect-jun-park",
    kind: "suspect",
    suspectId: "jun-park",
    name: "Jun Park",
    title: "Master Horologist",
    color: "#4f7660",
  },
] as const satisfies readonly SuspectCard[];

export const WEAPONS = [
  {
    id: "weapon-clockmakers-hammer",
    kind: "weapon",
    weaponId: "clockmakers-hammer",
    name: "Clockmaker’s Hammer",
    description: "A compact brass-and-ebony precision hammer.",
  },
  {
    id: "weapon-conservatory-shears",
    kind: "weapon",
    weaponId: "conservatory-shears",
    name: "Conservatory Shears",
    description: "Long blades of carefully honed blued steel.",
  },
  {
    id: "weapon-marble-raven",
    kind: "weapon",
    weaponId: "marble-raven",
    name: "Marble Raven Bookend",
    description: "A severe black-marble bird with a heavy base.",
  },
  {
    id: "weapon-crystal-decanter",
    kind: "weapon",
    weaponId: "crystal-decanter",
    name: "Crystal Decanter",
    description: "A weighty vessel cut with a field of sharp facets.",
  },
  {
    id: "weapon-bell-pull-cord",
    kind: "weapon",
    weaponId: "bell-pull-cord",
    name: "Bell-Pull Cord",
    description: "A braided silk cord finished with brass fittings.",
  },
  {
    id: "weapon-telescope-counterweight",
    kind: "weapon",
    weaponId: "telescope-counterweight",
    name: "Telescope Counterweight",
    description: "A dense cast-bronze weight from the observatory mount.",
  },
] as const satisfies readonly WeaponCard[];

export const ROOMS = [
  {
    id: "room-star-observatory",
    kind: "room",
    roomId: "star-observatory",
    name: "Star Observatory",
    description: "A copper-domed chamber trained on the night sky.",
  },
  {
    id: "room-map-archive",
    kind: "room",
    roomId: "map-archive",
    name: "Map Archive",
    description: "Sea charts and expedition maps fill ordered cabinets.",
  },
  {
    id: "room-winter-glasshouse",
    kind: "room",
    roomId: "winter-glasshouse",
    name: "Winter Glasshouse",
    description: "Rare orchids crowd beneath rain-streaked panes.",
  },
  {
    id: "room-portrait-salon",
    kind: "room",
    roomId: "portrait-salon",
    name: "Portrait Salon",
    description: "Generations of watchful faces line velvet walls.",
  },
  {
    id: "room-lantern-atrium",
    kind: "room",
    roomId: "lantern-atrium",
    name: "Lantern Atrium",
    description: "The mansion's luminous heart beneath a painted cupola.",
  },
  {
    id: "room-music-conservatory",
    kind: "room",
    roomId: "music-conservatory",
    name: "Music Conservatory",
    description: "A lacquered grand piano waits beneath silk drapery.",
  },
  {
    id: "room-trophy-hall",
    kind: "room",
    roomId: "trophy-hall",
    name: "Trophy Hall",
    description: "Expedition relics and silver cups crowd dark cabinets.",
  },
  {
    id: "room-cedar-dining-room",
    kind: "room",
    roomId: "cedar-dining-room",
    name: "Cedar Dining Room",
    description: "A long table gleams beneath shaded brass lamps.",
  },
  {
    id: "room-copper-kitchen",
    kind: "room",
    roomId: "copper-kitchen",
    name: "Copper Kitchen",
    description: "Copper pans gleam above an immense iron range.",
  },
] as const satisfies readonly RoomCard[];

export const CARDS: readonly GameCard[] = [...SUSPECTS, ...WEAPONS, ...ROOMS];

export const SUSPECT_IDS = SUSPECTS.map((card) => card.suspectId) as SuspectId[];
export const WEAPON_IDS = WEAPONS.map((card) => card.weaponId) as WeaponId[];
export const ROOM_IDS = ROOMS.map((card) => card.roomId) as RoomId[];

export const CARD_BY_ID: Readonly<Record<CardId, GameCard>> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

export const suspectCardId = (suspectId: SuspectId): CardId =>
  `suspect-${suspectId}`;
export const weaponCardId = (weaponId: WeaponId): CardId => `weapon-${weaponId}`;
export const roomCardId = (roomId: RoomId): CardId => `room-${roomId}`;

export function isSuspectId(value: string): value is SuspectId {
  return SUSPECT_IDS.includes(value);
}

export function isWeaponId(value: string): value is WeaponId {
  return WEAPON_IDS.includes(value);
}

export function isRoomId(value: string): value is RoomId {
  return ROOM_IDS.includes(value);
}
