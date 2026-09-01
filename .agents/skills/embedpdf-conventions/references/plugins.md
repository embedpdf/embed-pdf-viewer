# Authoring a plugin

Every plugin follows the **same file layout**, so any contributor can open any
plugin and instantly know where things live. The file names map 1:1 to the kernel
concepts — the layout _is_ the architecture.

```
plugin-foo/src/
  types.ts        # FooState · FooAction · FooConfig · FooCapability · FooToken
  contract.ts     # public token/protocol dependency entry (implementation-free)
  host-contract.ts # wider sibling-plugin protocol, when needed (optional)
  reducer.ts      # initialFooState + fooReducer                                   (the pure core)
  capability.ts   # createFooCapability(ctx): selectors + intents                  (the public API)
  effects.ts      # registerFooEffects(ctx): side-effects (engine, async, persist) (optional)
  foo.plugin.ts   # definePlugin({ id, token, requires, reduce, capability, effects }) (the wiring)
  internal.ts     # non-public helpers; visibility boundary, not bundle-pure (optional)
  index.ts        # implementation entry: plugin factory + re-exported contract
```

A plugin can omit pieces:

| Kind                                  | Has                                                   |
| ------------------------------------- | ----------------------------------------------------- |
| **Stateful + API** (stage, marker)    | types · reducer · capability · plugin · index         |
| **Effects-only** (storage, telemetry) | types · effects · plugin · index — no state, no token |

## The five rules

1. **The reducer is pure and serializable.** `(state, action) => state`. No engine,
   no DOM, no `Date.now()`. This is the part that ports to Rust verbatim.
2. **The capability is the only public surface.** Selectors (pure reads) + intents
   (write via `ctx.dispatch`). Other plugins depend on the _capability_, never the
   internals. Resolve others with `ctx.get(Token)` / `ctx.tryGet(Token)`.
3. **Side-effects live in `effects`.** The only place for async, IO, timers, and
   cross-plugin reactions. You get `ctx.watch`, `ctx.onAction`, `ctx.cleanup`.
4. **Declare dependencies with `requires`.** The kernel validates them at startup
   (fail-fast) and orders `init`/`effects` so deps are ready first. `optional` for
   soft deps (paired with `ctx.tryGet`).
5. **One token per capability.** `createCapabilityToken<FooCapability>('foo')` lives
   in `types.ts`; it carries the capability type, so resolution is typed (no casts).

## Package-entry and bundle boundaries

`internal` and `contract` answer different questions. `/internal` means “not
public application API”; it may expose capability factories, reducers, geometry,
or any other implementation helper. It makes **no bundle-size promise**.

Every plugin instead publishes these deliberate dependency doors:

- `@embedpdf/plugin-foo` is the **implementation opt-in**. Import it for
  `fooPlugin()` or from the framework feature entry that installs/re-exports that
  plugin. The root re-exports the public contract for API compatibility.
- `@embedpdf/plugin-foo/contract` is the **public capability protocol**: the one
  runtime token plus types and genuinely small protocol helpers. Its runtime
  graph must not reach `*.plugin.ts`, `capability.ts`, `reducer.ts`, or
  `effects.ts`.
- `@embedpdf/plugin-foo/contract/host` is optional. It exposes a wider type lens
  over the **same token object** when sibling plugins need registration or host
  methods that application code should not see.
- Named entries such as `/destination`, `/authoring`, or `/scripting` expose a
  deliberate pure/helper feature that is neither a capability contract nor the
  full plugin implementation.

The source-code convention is mechanical:

1. Plugin source never imports another plugin's bare package root—not even for
   types. Use `/contract`, `/contract/host`, or a named helper entry.
2. Framework source follows the same rule for sibling plugins. A framework
   feature may import its **own** bare plugin root only when that feature entry
   explicitly re-exports the root and therefore intentionally opts users into
   the implementation.
3. Application and composition source may import a bare plugin root in a module
   that imports that plugin's `*Plugin` factory. Elsewhere, even type-only or
   token imports use the contract entry. This keeps implementation opt-ins
   visible at the installation site.
4. `requires` and `optional` describe kernel startup/runtime relationships. They
   do not create a JavaScript module boundary and do not replace contract
   imports.
5. Keep the token definition singular. The root, `/contract`,
   `/contract/host`, and `/internal` must all re-export or narrow the same token;
   never call `createCapabilityToken` twice.

Run `pnpm check:plugin-boundaries` locally. CI runs the same AST-based check and
its fixture tests, so a root import or implementation-bearing contract cannot be
silently reintroduced. This is useful for CJS and conservative bundlers; modern
ESM tree-shaking still benefits from the clearer dependency graph and does not
have to be trusted as the only line of defense.

## `requires` + `effects` — when to reach for them

- **Tiling / render** — `watch` the Stage camera → request rasters for visible pages
  (debounce + abort on the next change).
- **Search** — `onAction('SEARCH')` → `ctx.engine.search()` (async) → dispatch hits.
- **Persistence** — `watch` view-state → debounce-save; restore on load.
- **Coordination** — `onAction(CORE_DOCUMENT_LOADED)` → seed per-page state;
  on annotation created → mark history dirty.
- **Telemetry** — `onAction(...)` → emit analytics.

## Skeleton

```ts
// types.ts
export interface FooCapability {
  count(): number;
  bump(): void;
}
export const FooToken = createCapabilityToken<FooCapability>('foo');

// reducer.ts
export const initialFooState = { n: 0 };
export const fooReducer = (s, a) => (a.type === 'BUMP' ? { n: s.n + 1 } : s);

// capability.ts
export const createFooCapability = (ctx): FooCapability => ({
  count: () => ctx.getState().n,
  bump: () => ctx.dispatch({ type: 'BUMP' }),
});

// foo.plugin.ts
export const fooPlugin = () =>
  definePlugin({
    id: 'foo',
    token: FooToken,
    requires: [StageToken], // validated + ordered
    initialState: initialFooState,
    reduce: fooReducer,
    capability: createFooCapability,
    effects: (ctx) => {
      ctx.onAction(CORE_DOCUMENT_LOADED, () => {
        /* seed */
      });
      ctx.watch(
        () => ctx.get(StageToken).currentPage(),
        (page) => {
          /* react */
        },
      );
    },
  });

// contract.ts
export { FooToken } from './types';
export type { FooCapability, FooConfig, FooState } from './types';

// index.ts
export { fooPlugin } from './foo.plugin';
export * from './contract';
```
