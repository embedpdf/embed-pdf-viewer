# Authoring a plugin

Every plugin follows the **same file layout**, so any contributor can open any
plugin and instantly know where things live. The file names map 1:1 to the kernel
concepts — the layout _is_ the architecture.

```
plugin-foo/src/
  types.ts        # FooState · FooAction · FooConfig · FooCapability · FooToken   (the contract)
  reducer.ts      # initialFooState + fooReducer                                   (the pure core)
  capability.ts   # createFooCapability(ctx): selectors + intents                  (the public API)
  effects.ts      # registerFooEffects(ctx): side-effects (engine, async, persist) (optional)
  foo.plugin.ts   # definePlugin({ id, token, requires, reduce, capability, effects }) (the wiring)
  index.ts        # public exports
```

A plugin can omit pieces:

| Kind                                  | Has                                                   |
| ------------------------------------- | ----------------------------------------------------- |
| **Stateful + API** (stage, marker)    | types · reducer · capability · plugin · index         |
| **Effects-only** (persist, telemetry) | types · effects · plugin · index — no state, no token |

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

## `requires` + `effects` — when to reach for them

- **Tiling / render** — `watch` the Stage camera → request rasters for visible pages
  (debounce + abort on the next change).
- **Search** — `onAction('SEARCH')` → `ctx.engine.search()` (async) → dispatch hits.
- **Persistence** — `watch` view-state → debounce-save; restore on load. _(see
  `plugin-persist`.)_
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
```
