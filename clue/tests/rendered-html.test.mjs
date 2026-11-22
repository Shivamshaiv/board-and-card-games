import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("https://the-gilded-alibi.example/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the complete Vesper House application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Gilded Alibi — A Vesper House Mystery<\/title>/i);
  assert.match(html, /The Gilded Alibi/i);
  assert.match(html, /A Vesper House Mystery/i);
  assert.match(html, /\/og\.png/i);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("ships the social card and the complete optimized evidence-art set", async () => {
  const portraits = ["amara-saye", "elias-rook", "celeste-maren", "inez-calder", "mateo-vale", "jun-park"];
  const weaponArt = ["clockmakers-hammer", "conservatory-shears", "marble-raven", "crystal-decanter", "bell-pull-cord", "telescope-counterweight"];
  const roomArt = ["star-observatory", "map-archive", "winter-glasshouse", "portrait-salon", "lantern-atrium", "music-conservatory", "trophy-hall", "cedar-dining-room", "copper-kitchen"];
  await access(new URL("../public/og.png", import.meta.url));
  await Promise.all(portraits.map((name) => access(new URL(`../public/portraits/${name}-v2.webp`, import.meta.url))));
  await Promise.all(weaponArt.map((name) => access(new URL(`../public/card-art/weapon-${name}.webp`, import.meta.url))));
  await Promise.all(roomArt.map((name) => access(new URL(`../public/card-art/room-${name}.webp`, import.meta.url))));

  const content = await readFile(new URL("../src/ui/content.ts", import.meta.url), "utf8");
  for (const name of portraits) assert.match(content, new RegExp(`/portraits/${name}-v2\\.webp`));
  for (const name of weaponArt) assert.match(content, new RegExp(`/card-art/weapon-${name}\\.webp`));
  for (const name of roomArt) assert.match(content, new RegExp(`/card-art/room-${name}\\.webp`));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
