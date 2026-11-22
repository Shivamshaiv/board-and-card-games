export interface AssetRecord {
  readonly id: string;
  readonly model?: string;
  readonly portrait?: string;
  readonly cardArt?: string;
  readonly cardChecksum?: string;
  readonly cardProvenance?: string;
  readonly material?: string;
  readonly lod?: readonly string[];
  readonly audio?: readonly string[];
  readonly scale?: number;
  readonly pivot?: readonly [number, number, number];
  readonly license: string;
  readonly provenance: string;
  readonly checksum: string;
}

export type AssetManifest = Readonly<Record<string, AssetRecord>>;

const originalGenerated = "Original project image generated for The Gilded Alibi; no reference to third-party characters, logos, or layouts.";
const originalProcedural = "Original runtime geometry and materials authored in React Three Fiber for this project.";
const roomCardChecksums: Readonly<Record<string, string>> = {
  "star-observatory": "406ffdd3fec55546931063cd7cadc79db26403935454da1606509d50e9d47060",
  "map-archive": "31089db0dea93ce541373639b40dd5892b8159041dc2f3fc9200956b9f215ffc",
  "winter-glasshouse": "35f714b638d62c9d929c5b0c845d78b0ee9809f5bc43695b957b3f30a620e721",
  "portrait-salon": "af52311a1d5cf703d7d5412e0f14434ecfbe9df53705138816d7a629a4c50ba9",
  "lantern-atrium": "a2ea34f0a508e739c4c572f28bf86f45cf37b56599b76decb0d0a2293fd48dd2",
  "music-conservatory": "de97faa7e47523ac7bc5701c24bf681419316c8832e16b6edf182813f6b48f06",
  "trophy-hall": "62dcb59dd64b830bac438104fbf1bc67e866ad8eae63c67461595c0b45c2b043",
  "cedar-dining-room": "cebf72670694e43784f0496cd9804d8378df761d6883d14fe42ef40a2f0254c2",
  "copper-kitchen": "8004b7f7ca72319f58fdd53bc4b1c13369949aa373fb131acdfa97d270e9dc1a",
};
const roomAssets = Object.fromEntries([
  "star-observatory", "map-archive", "winter-glasshouse", "portrait-salon", "lantern-atrium",
  "music-conservatory", "trophy-hall", "cedar-dining-room", "copper-kitchen",
].map((roomId) => [`room:${roomId}`, {
  id: `room:${roomId}`,
  model: `procedural://room/${roomId}`,
  cardArt: `/card-art/room-${roomId}.webp`,
  cardChecksum: roomCardChecksums[roomId],
  cardProvenance: originalGenerated,
  material: "walnut-brass-marble-velvet",
  lod: ["high", "medium", "low"],
  license: "Original project asset",
  provenance: originalProcedural,
  checksum: "runtime-procedural-v2",
}])) as AssetManifest;

export const ASSET_MANIFEST: AssetManifest = {
  "suspect:amara-saye": { id: "suspect:amara-saye", model: "procedural://suspect/amara-saye", portrait: "/portraits/amara-saye-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "752db9a311189ffe78d6aced6a1537894fe4991089340f79f690d9e0fdde5b8b" },
  "suspect:elias-rook": { id: "suspect:elias-rook", model: "procedural://suspect/elias-rook", portrait: "/portraits/elias-rook-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "d20097dbde144e731bd529e50c6cac9ae5aa5146b2437848ad17a275410fb632" },
  "suspect:celeste-maren": { id: "suspect:celeste-maren", model: "procedural://suspect/celeste-maren", portrait: "/portraits/celeste-maren-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "44a83a3e5bc08b7d7400cc1fb215ad6f2fe0ea4902ed70ae17e5f27246a6f494" },
  "suspect:inez-calder": { id: "suspect:inez-calder", model: "procedural://suspect/inez-calder", portrait: "/portraits/inez-calder-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "5e04a2bf5a6685431aed9e5fd2c41207a00e2b551ba8c669b67237f91ba667b5" },
  "suspect:mateo-vale": { id: "suspect:mateo-vale", model: "procedural://suspect/mateo-vale", portrait: "/portraits/mateo-vale-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "070e780f29bdc8f835d46335a06f60bd3bcca712db80b986ab34f897d0cb2148" },
  "suspect:jun-park": { id: "suspect:jun-park", model: "procedural://suspect/jun-park", portrait: "/portraits/jun-park-v2.webp", scale: 1, pivot: [0, 0, 0], license: "Original project asset", provenance: originalGenerated, checksum: "110b04da3bba2a52b2103de8ab37604e356c111a4cad005d0dc7dd6accc4e7a2" },
  "weapon:clockmakers-hammer": { id: "weapon:clockmakers-hammer", model: "procedural://weapon/clockmakers-hammer", cardArt: "/card-art/weapon-clockmakers-hammer.webp", cardChecksum: "aef4b624baf2b1c9b508aea58ca509725d19dd05bae9cc0a243d59bee0610e07", cardProvenance: originalGenerated, material: "brass-ebony", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  "weapon:conservatory-shears": { id: "weapon:conservatory-shears", model: "procedural://weapon/conservatory-shears", cardArt: "/card-art/weapon-conservatory-shears.webp", cardChecksum: "c42e3d570e131a903047ec96e92e24ef6541426ee32daa364ec5f57be698fa82", cardProvenance: originalGenerated, material: "blued-steel", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  "weapon:marble-raven": { id: "weapon:marble-raven", model: "procedural://weapon/marble-raven", cardArt: "/card-art/weapon-marble-raven.webp", cardChecksum: "0e290b7369ebb633e2c9a521fec13dd6db91be17581bca03f997cd3d8d687b31", cardProvenance: originalGenerated, material: "nero-marble", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  "weapon:crystal-decanter": { id: "weapon:crystal-decanter", model: "procedural://weapon/crystal-decanter", cardArt: "/card-art/weapon-crystal-decanter.webp", cardChecksum: "5b85193bc16c7ecb0daee6c11c1c776464c53faebc392c26b7e034f9b110377e", cardProvenance: originalGenerated, material: "cut-crystal", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  "weapon:bell-pull-cord": { id: "weapon:bell-pull-cord", model: "procedural://weapon/bell-pull-cord", cardArt: "/card-art/weapon-bell-pull-cord.webp", cardChecksum: "b1effb4facfc4e9c749d2c500d5484d735926034bca4c536a57e1b4d96144777", cardProvenance: originalGenerated, material: "silk-brass", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  "weapon:telescope-counterweight": { id: "weapon:telescope-counterweight", model: "procedural://weapon/telescope-counterweight", cardArt: "/card-art/weapon-telescope-counterweight.webp", cardChecksum: "17af63e55d412e1c16c8be56704d66c996a7e9ccd65f8538a419a3c81895df16", cardProvenance: originalGenerated, material: "cast-bronze", license: "Original project asset", provenance: originalProcedural, checksum: "runtime-procedural-v2" },
  ...roomAssets,
  "social:vesper-house": { id: "social:vesper-house", portrait: "/og.png", license: "Original project asset", provenance: originalGenerated, checksum: "5b2b827d4a3cdb8309666fcaec00fbffb30703519bc784501ab9e1bf04e3b8eb" },
};
