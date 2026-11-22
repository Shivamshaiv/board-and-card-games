export const SUSPECTS = [
  {
    id: "amara-saye",
    name: "Dr. Amara Saye",
    shortName: "Amara",
    role: "Botanical chemist",
    color: "#0f765f",
    accent: "#d79a38",
    sigil: "AS",
    portrait: "/portraits/amara-saye-v2.webp",
    dossier: "Her formulas saved Vesper's conservatory—and may have cost him more than money.",
  },
  {
    id: "elias-rook",
    name: "Elias Rook",
    shortName: "Elias",
    role: "Estate architect",
    color: "#496878",
    accent: "#b86f45",
    sigil: "ER",
    portrait: "/portraits/elias-rook-v2.webp",
    dossier: "He knows every wall in Vesper House, including the ones that should not exist.",
  },
  {
    id: "celeste-maren",
    name: "Celeste Maren",
    shortName: "Celeste",
    role: "Illusion designer",
    color: "#7647a2",
    accent: "#eee7de",
    sigil: "CM",
    portrait: "/portraits/celeste-maren-v2.webp",
    dossier: "Her finest trick was commissioned for tonight—and Adrian Vesper refused to pay.",
  },
  {
    id: "inez-calder",
    name: "Inez Calder",
    shortName: "Inez",
    role: "Aviator & shipping heir",
    color: "#d79721",
    accent: "#162e4a",
    sigil: "IC",
    portrait: "/portraits/inez-calder-v2.webp",
    dossier: "Her family fortune crossed Vesper's docks. Their final ledger did not balance.",
  },
  {
    id: "mateo-vale",
    name: "Mateo Vale",
    shortName: "Mateo",
    role: "Investigative columnist",
    color: "#245eb3",
    accent: "#c89a61",
    sigil: "MV",
    portrait: "/portraits/mateo-vale-v2.webp",
    dossier: "He arrived with a notebook full of accusations and one page torn cleanly away.",
  },
  {
    id: "jun-park",
    name: "Jun Park",
    shortName: "Jun",
    role: "Master horologist",
    color: "#287453",
    accent: "#b68a45",
    sigil: "JP",
    portrait: "/portraits/jun-park-v2.webp",
    dossier: "The astronomical clock was his life's work. Vesper planned to unveil it as his own.",
  },
] as const;

export const WEAPONS = [
  { id: "clockmakers-hammer", name: "Clockmaker’s Hammer", glyph: "⚒", material: "Brass & ebony", art: "/card-art/weapon-clockmakers-hammer.webp" },
  { id: "conservatory-shears", name: "Conservatory Shears", glyph: "✂", material: "Blued steel", art: "/card-art/weapon-conservatory-shears.webp" },
  { id: "marble-raven", name: "Marble Raven Bookend", glyph: "◆", material: "Nero marble", art: "/card-art/weapon-marble-raven.webp" },
  { id: "crystal-decanter", name: "Crystal Decanter", glyph: "♢", material: "Cut crystal", art: "/card-art/weapon-crystal-decanter.webp" },
  { id: "bell-pull-cord", name: "Bell-Pull Cord", glyph: "⌁", material: "Silk & brass", art: "/card-art/weapon-bell-pull-cord.webp" },
  { id: "telescope-counterweight", name: "Telescope Counterweight", glyph: "◉", material: "Cast bronze", art: "/card-art/weapon-telescope-counterweight.webp" },
] as const;

export const ROOMS = [
  { id: "star-observatory", name: "Star Observatory", index: "I", tone: "blue", art: "/card-art/room-star-observatory.webp" },
  { id: "map-archive", name: "Map Archive", index: "II", tone: "gold", art: "/card-art/room-map-archive.webp" },
  { id: "winter-glasshouse", name: "Winter Glasshouse", index: "III", tone: "green", art: "/card-art/room-winter-glasshouse.webp" },
  { id: "portrait-salon", name: "Portrait Salon", index: "IV", tone: "red", art: "/card-art/room-portrait-salon.webp" },
  { id: "lantern-atrium", name: "Lantern Atrium", index: "V", tone: "cream", art: "/card-art/room-lantern-atrium.webp" },
  { id: "music-conservatory", name: "Music Conservatory", index: "VI", tone: "violet", art: "/card-art/room-music-conservatory.webp" },
  { id: "trophy-hall", name: "Trophy Hall", index: "VII", tone: "bronze", art: "/card-art/room-trophy-hall.webp" },
  { id: "cedar-dining-room", name: "Cedar Dining Room", index: "VIII", tone: "cedar", art: "/card-art/room-cedar-dining-room.webp" },
  { id: "copper-kitchen", name: "Copper Kitchen", index: "IX", tone: "copper", art: "/card-art/room-copper-kitchen.webp" },
] as const;

export type SuspectId = (typeof SUSPECTS)[number]["id"];
export type WeaponId = (typeof WEAPONS)[number]["id"];
export type RoomId = (typeof ROOMS)[number]["id"];

export const ALL_NOTEBOOK_CARDS = [
  ...SUSPECTS.map((item) => ({ id: item.id, name: item.name, category: "Suspects" as const })),
  ...WEAPONS.map((item) => ({ id: item.id, name: item.name, category: "Weapons" as const })),
  ...ROOMS.map((item) => ({ id: item.id, name: item.name, category: "Rooms" as const })),
];
