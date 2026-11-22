# The Gilded Alibi

An original, single-player browser deduction game set inside Vesper House. The release contains a complete 21-card case, a deterministic 25×25 rules board, six suspects, six weapons, nine rooms, privacy-safe AI opponents, a semantic notebook, local autosave, accessibility controls, and a procedural React Three Fiber mansion.

## Run locally

```bash
npm install
npm run dev
```

The development site is available at `http://localhost:3000` by default.

## Verify

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` runs the deterministic game/AI/privacy/persistence suites, builds the Cloudflare-compatible Sites output, and smoke-tests the rendered route.

## Architecture

- `src/game` — browser-independent rules, board graph, seeded RNG, scoped events, and redacted player views.
- `src/ai` — observation sanitization, constraint reasoning, deterministic difficulty policies, and the game-command adapter.
- `src/persistence` — versioned IndexedDB autosave with localStorage and memory fallbacks.
- `src/three` and `src/presentation` — procedural mansion, pieces, props, cameras, dice, lighting, and adaptive quality.
- `src/ui` — setup, game table, action dock, cards, suggestion/accusation flows, notebook, tutorial, and settings.

No account, backend, cloud save, or online multiplayer service is required. “The Gilded Alibi” is a working original title pending formal name clearance.
