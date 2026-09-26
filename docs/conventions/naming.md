# Naming

Names are the first documentation a reader sees. These rules exist so that any
file in the repository reads the same way, and so that a name can be trusted
without opening its definition.

Package names follow a separate law: [`packages.md`](./packages.md).

## Principles

1. **A name says what the value is in the domain**, not its type or storage:
   `annotation`, `field`, `pane`, `hit`. Not `a`, `f`, `obj`, `data`.
2. **Spell words out.** Abbreviations are allowed only when the glossary below
   lists them.
3. **One name per concept, everywhere.** If the engine calls it a `PageRef`,
   nothing calls it a page id, pointer or address.
4. **A name's length follows its reach.** Exported and module-level names must
   stand alone. A two-line callback may use a short word (`page`, `hit`), never
   a letter.

## Identifiers

| Kind                             | Rule                                                                                                                                                       | Example                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Single letters                   | Only `i`/`j` as numeric loop counters, `x`/`y` as coordinates, and `_` for an ignored parameter.                                                           | `for (let i = 0; …)`, `{ x, y }`                                               |
| Comparators and equality helpers | `left`/`right`, never `a`/`b`.                                                                                                                             | `(left, right) => left.index - right.index`                                    |
| Callback parameters              | Name what the callback receives.                                                                                                                           | `useSelector(SearchToken, (search) => search.getActiveHit())`                  |
| Boolean values                   | Adjectives or participles for state: `open`, `placed`, `resting`, `readOnly`.                                                                              | `pane.open`                                                                    |
| Boolean functions                | `is*`, `has*`, `can*`, `should*`, `would*`.                                                                                                                | `canEdit()`                                                                    |
| Permissions                      | Always `can*`, as a capability method; a component that needs it reactively reads it with a selector into a local of the same name. Never a renamed field. | `const canEdit = useSelector(PageEditToken, (pageEdit) => pageEdit.canEdit())` |
| Functions                        | Start with a verb. `create*` builds an instance, `to*` converts, `*Of(value)` is a pure lookup or projection.                                              | `createPane`, `toPageRef`, `originOf(event)`                                   |
| Constants                        | `UPPER_SNAKE` only for module-level constants holding primitives or frozen data.                                                                           | `DEFAULT_CHROME`, `RERUN_DELAY_MS`                                             |
| Units                            | Put the unit in the name when it is not obvious.                                                                                                           | `delayMs`, `thresholdPx`, `sizePt`, `angleDeg`                                 |
| Unused parameters                | Prefix with `_`. Never use `_` for "private".                                                                                                              | `(_event, page) => …`                                                          |
| Declarations                     | `const` unless reassigned; `let` otherwise; never `var`.                                                                                                   |                                                                                |
| Generic parameters               | `T`, `K`, `V` only in fully generic helpers; name them elsewhere.                                                                                          | `memo<Inputs, Result>`, `PluginDef<State, Capability>`                         |

## Glossary

These are the only abbreviations, and the exact meaning of words that are easy
to mix up.

| Word                                     | Means exactly                                                                              | Never used for                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ctx`                                    | the plugin's `PluginContext`                                                               | action, command or canvas contexts (`actionContext`, `commandContext`, `canvasContext`)   |
| `doc`                                    | a `DocumentHandle`                                                                         | document metadata (`documentInfo`), DOM documents (`ownerDocument`)                       |
| `api`                                    | the capability object a controller is assembling                                           | a capability received from elsewhere (name it after its plugin: `annotation`, `stage`)    |
| `id` / `ids`                             | an opaque string identifier                                                                | object numbers, refs, keys                                                                |
| `ref`                                    | a typed engine reference (`PageRef`, `AnnotationRef`, `FormFieldRef`)                      | DOM refs (`elementRef`), ids                                                              |
| `key`                                    | a string derived from a ref for map lookups (`annotationKey`, `encodePageKey`, `FieldKey`) | refs, ids                                                                                 |
| `dto`                                    | an engine DTO, only in code that converts DTOs                                             | model records                                                                             |
| `page`                                   | a `PageRef`                                                                                | a display index (`pageIndex`), an object number (`pageObjectNumber`), layout (`pageInfo`) |
| `pageIndex`                              | a zero-based display position                                                              | identity                                                                                  |
| `pageObjectNumber`                       | the scalar object-number foreign key (type `PageObjectNumber`)                             |                                                                                           |
| `record`                                 | an entry of a mirror (engine data held by a plugin)                                        | DTOs, overlay entries                                                                     |
| `event`                                  | a document or capability event                                                             | a DOM event in code that also handles document events (`domEvent`)                        |
| `dx`, `dy`                               | coordinate deltas                                                                          |                                                                                           |
| `url`, `uri`, `dpr`, `min`, `max`, `pdf` | themselves                                                                                 |                                                                                           |

Spell out everything else: `error` (not `err`, `e`), `options` (not `opts`),
`config` (not `cfg`), `previous` (not `prev`), `current` (not `cur`), `index`
(not `idx`), `result` (not `res`), `callback` (not `cb`), `element` (not `el`),
`message` (not `msg`), `definition` (not `def`), `selection` (not `sel`).

## Types

| Suffix                            | Use                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `XState`                          | a plugin's session state                                                        |
| `XCapability` / `XHostCapability` | the public / sibling-plugin capability                                          |
| `XConfig`                         | registration configuration (`xPlugin(config)`)                                  |
| `XOptions`                        | per-call options; extends `OperationOptions` when the call does work            |
| `XInput`                          | the input of a create verb                                                      |
| `XPatch`                          | a partial update                                                                |
| `XInfo`                           | a public read shape that is not the internal record                             |
| `XRef` / `XKey` / `XId`           | as in the glossary                                                              |
| `XEvent`                          | an event payload, named after its event: `onFieldCreated` → `FieldCreatedEvent` |
| `XRecord`                         | a mirror entry                                                                  |

- Use `interface` for object shapes in contracts, and `type` for unions,
  aliases and mapped types.
- Contract fields and state fields are `readonly`.
- Getters return `T | null` for "absent". Optional inputs and optional data
  fields use `?:`. One API never uses both `undefined` and `null` for the same
  meaning.

## Discriminated unions

- **`type`** tags things that happen: messages, events, effects.
- **`kind`** tags things that are: geometry, refs, borders, drafts.
- Tag values use one style per union (kebab-case or camelCase), never both.

## Capability vocabulary

| Verb                                   | Meaning                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `get*`, `list*`, `is*`, `has*`, `can*` | Read current state. Always synchronous.                                                  |
| `read*`, `load*`                       | Read from the engine. Always returns a promise.                                          |
| `ensureLoaded(page)`                   | Start loading if needed. Returns `Promise<void>`.                                        |
| `refresh()`                            | Reload engine data. Returns `Promise<void>`.                                             |
| `set*` / `update*`                     | Change a value: `set` replaces, `update` merges.                                         |
| `create*` / `delete*`                  | Make or destroy a document object.                                                       |
| `add*` / `remove*`                     | Put into or take out of a collection.                                                    |
| `open` / `close` / `toggle`            | Surfaces, menus, documents.                                                              |
| `begin*` / `end*`                      | Bracket a gesture or an edit session.                                                    |
| `register*`                            | Add an extension. Always returns `Unsubscribe`.                                          |
| `on*` on a capability                  | An `EventHook`, named `on<Subject?><PastParticiple>`: `onFieldCreated`, `onZoomChanged`. |
| `on*` on a registration object         | A callback the capability calls, such as `InteractionHandler.onDown`.                    |

`i18n.t` is the one single-letter member, following the universal i18n convention.

## Files and folders

- Files are kebab-case and hold one area each, named for the area:
  `write/values.ts`, `read/widgets.ts`.
- Plugins follow the anatomy in [`plugins.md`](./plugins.md).
- Tests mirror `src/` under `test/`. Test names are sentences that describe behavior.

## Enforcement

ESLint enforces the mechanical parts:

- `id-length` with the single-letter exceptions above;
- `id-denylist` for the spelled-out words above;
- `@typescript-eslint/naming-convention` for casing.

Review covers the rest.
