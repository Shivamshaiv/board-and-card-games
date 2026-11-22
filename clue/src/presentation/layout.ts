import type {
  PresentationRoom,
  PresentationTile,
  ScenePiece,
  SceneWeapon,
} from "./types";

export const MANSION_ROOMS = [
  {
    id: "star-observatory",
    name: "Star Observatory",
    position: [-7, -5.5],
    size: [5.25, 4],
    accent: "#6e91a8",
    floor: "#1e303b",
    doors: ["east", "south"],
  },
  {
    id: "map-archive",
    name: "Map Archive",
    position: [0, -5.5],
    size: [5.25, 4],
    accent: "#c4a06a",
    floor: "#4c3424",
    doors: ["east", "south", "west"],
  },
  {
    id: "winter-glasshouse",
    name: "Winter Glasshouse",
    position: [7, -5.5],
    size: [5.25, 4],
    accent: "#7fa889",
    floor: "#244438",
    doors: ["south", "west"],
  },
  {
    id: "portrait-salon",
    name: "Portrait Salon",
    position: [-7, 0],
    size: [5.25, 4],
    accent: "#b26b82",
    floor: "#4f2635",
    doors: ["north", "east", "south"],
  },
  {
    id: "lantern-atrium",
    name: "Lantern Atrium",
    position: [0, 0],
    size: [5.25, 4],
    accent: "#d5ae67",
    floor: "#4d4840",
    doors: ["north", "east", "south", "west"],
  },
  {
    id: "music-conservatory",
    name: "Music Conservatory",
    position: [7, 0],
    size: [5.25, 4],
    accent: "#9b89c1",
    floor: "#38334f",
    doors: ["north", "south", "west"],
  },
  {
    id: "trophy-hall",
    name: "Trophy Hall",
    position: [-7, 5.5],
    size: [5.25, 4],
    accent: "#b98a50",
    floor: "#3f3024",
    doors: ["north", "east"],
  },
  {
    id: "cedar-dining-room",
    name: "Cedar Dining Room",
    position: [0, 5.5],
    size: [5.25, 4],
    accent: "#aa714b",
    floor: "#43271f",
    doors: ["north", "east", "west"],
  },
  {
    id: "copper-kitchen",
    name: "Copper Kitchen",
    position: [7, 5.5],
    size: [5.25, 4],
    accent: "#cd8154",
    floor: "#443832",
    doors: ["north", "west"],
  },
] as const satisfies readonly PresentationRoom[];

function buildCorridorTiles(): PresentationTile[] {
  const tiles: PresentationTile[] = [];

  for (const z of [-2.75, 2.75]) {
    for (let step = 0; step <= 25; step += 1) {
      const x = -10 + step * 0.8;
      tiles.push({
        id: `corridor-h-${z < 0 ? "n" : "s"}-${step}`,
        kind: "corridor",
        position: [Number(x.toFixed(2)), z],
      });
    }
  }

  for (const x of [-3.5, 3.5]) {
    for (let step = 0; step <= 20; step += 1) {
      const z = -8 + step * 0.8;
      if (Math.abs(Math.abs(z) - 2.75) < 0.35) continue;
      tiles.push({
        id: `corridor-v-${x < 0 ? "w" : "e"}-${step}`,
        kind: "corridor",
        position: [x, Number(z.toFixed(2))],
      });
    }
  }

  return tiles;
}

export const MANSION_TILES = buildCorridorTiles();

export const DEFAULT_PIECES = [
  { id: "piece-amara", suspect: "amara-saye", position: [-9.4, -8.05] },
  { id: "piece-elias", suspect: "elias-rook", position: [-3.5, -8.05] },
  { id: "piece-celeste", suspect: "celeste-maren", position: [3.5, -8.05] },
  { id: "piece-inez", suspect: "inez-calder", position: [9.4, -8.05] },
  { id: "piece-mateo", suspect: "mateo-vale", position: [-3.5, 8.05] },
  { id: "piece-jun", suspect: "jun-park", position: [3.5, 8.05] },
] as const satisfies readonly ScenePiece[];

export const DEFAULT_WEAPONS = [
  { id: "weapon-hammer", weapon: "clockmakers-hammer", roomId: "map-archive" },
  { id: "weapon-shears", weapon: "conservatory-shears", roomId: "winter-glasshouse" },
  { id: "weapon-raven", weapon: "marble-raven", roomId: "portrait-salon" },
  { id: "weapon-decanter", weapon: "crystal-decanter", roomId: "cedar-dining-room" },
  { id: "weapon-cord", weapon: "bell-pull-cord", roomId: "music-conservatory" },
  {
    id: "weapon-counterweight",
    weapon: "telescope-counterweight",
    roomId: "star-observatory",
  },
] as const satisfies readonly SceneWeapon[];

export const PRESENTATION_COLORS = {
  walnut: "#21140f",
  walnutLight: "#563526",
  oxblood: "#5e1f2a",
  teal: "#123a39",
  parchment: "#eee2c7",
  brass: "#a97935",
  brassBright: "#e0bb6c",
  ink: "#16181a",
} as const;

/**
 * The miniature palette mirrors the evidence UI, with a second material that
 * remains distinguishable in dim, color-blind, and reduced-quality scenes.
 */
export const SUSPECT_PALETTES = {
  "amara-saye": {
    primary: "#2d6b57",
    secondary: "#d89b3c",
    dark: "#173d34",
    light: "#f0c56f",
  },
  "elias-rook": {
    primary: "#61717a",
    secondary: "#bd7148",
    dark: "#29343b",
    light: "#d9a077",
  },
  "celeste-maren": {
    primary: "#75558f",
    secondary: "#e1d8df",
    dark: "#3c2a4c",
    light: "#f1e7ef",
  },
  "inez-calder": {
    primary: "#c68b35",
    secondary: "#1f3354",
    dark: "#5d3a12",
    light: "#f0c66c",
  },
  "mateo-vale": {
    primary: "#315d8f",
    secondary: "#d2ad78",
    dark: "#193653",
    light: "#e2c89f",
  },
  "jun-park": {
    primary: "#4f7660",
    secondary: "#c59a47",
    dark: "#203e31",
    light: "#e1c173",
  },
} as const;
