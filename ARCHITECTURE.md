# EmbedPDF v3 (work in progress)

A clean-room rebuild of the viewer architecture. **Independent of the v2 packages**
in `/packages` (kept untouched for reference & feature parity).

## Layers

```
engine            async PDF boundary (local-wasm | cloud-http).
  ↓ (async)
kernel            pure runtime: store · typed capabilities · plugin lifecycle. No DOM.
  ├─ stage-core   pure spatial model: Scene · Camera · Anchor · framing. The future Rust core.
  ├─ stage        the coordinate plugin (scroll+viewport+zoom+pan+spread collapse here)
  └─ plugin-*     feature plugins (interaction · selection · …). Pure; talk to the hub/Stage via intents.
  ↓ (sync, one adapter per framework)
react             generic reactive binding + <Viewer>/<Stage>/<PageView> + headless layers
```

## Packages

| Package                        | What                                                               |
| ------------------------------ | ------------------------------------------------------------------ | --- |
| `@embedpdf/core`               | store, `createCapabilityToken`, `definePlugin`, document lifecycle |
| `@embedpdf/core-stage`         | Camera / Scene / Anchor math (DOM-free, serializable)              |
| `@embedpdf/plugin-stage`       | the Stage plugin: intents (`goToPage`, `zoomTo`…) + selectors      |
| `@embedpdf/plugin-interaction` | the pointer/tool/cursor hub — features register handlers           |
| `@embedpdf/plugin-selection`   | text selection over the engine's geometry (cross-page)             |     |
| `@embedpdf/react`              | the React adapter — the entire framework surface                   |

## Dev experience

Packages use the **internal-packages pattern**: `main`/`types`/`exports` point at
`src/index.ts`, so your editor and Vite resolve straight to TypeScript source —
types work with **no build step**. `publishConfig` flips them to `dist` on publish.

## Commands (run from repo root)

```bash
pnpm dev:v3         # run the React example (Vite)
pnpm typecheck:v3   # strict typecheck every v3 package + example
pnpm build:v3       # emit dist/ artifacts (tsc) — for publish/CI
pnpm clean:v3       # remove dist/
```
