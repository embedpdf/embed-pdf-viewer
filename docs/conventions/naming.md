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
| Functions                        | Start with a verb. `create*` builds an instance, `to*` converts, `*Of(value)` is a pure lookup or projection.                                              | `createPane`, `toPageRef`, `regionsOf(mark)`                                   |
| Constants                        | `UPPER_SNAKE` only for module-level constants holding primitives or frozen data.                                                                           | `DEFAULT_CHROME`, `RERUN_DELAY_MS`                                             |
| Units                            | Put the unit in the name when it is not obvious.                                                                                                           | `delayMs`, `thresholdPx`, `sizePt`, `angleDeg`                                 |
| Unused parameters                | Prefix with `_`. Never use `_` for "private".                                                                                                              | `(_event, page) => …`                                                          |
| Declarations                     | `const` unless reassigned; `let` otherwise; never `var`.                                                                                                   |                                                                                |
| Generic parameters               | `T`, `K`, `V` only in fully generic helpers; name them elsewhere.                                                                                          | `memo<Inputs, Result>`, `PluginDefinition<State, Capability>`                         |

## Glossary

These are the only abbreviations, and the exact meaning of words that are easy
to mix up.

| Word                                     | Means exactly                                                                                                                                                                        | Never used for                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ctx`                                    | the plugin's `PluginContext`                                                                                                                                                         | action, command or canvas contexts (`actionContext`, `commandContext`, `canvasContext`)   |
| `doc`                                    | a `DocumentHandle`                                                                                                                                                                   | document metadata (`documentInfo`), DOM documents (`ownerDocument`)                       |
| `api`                                    | the capability object a controller is assembling                                                                                                                                     | a capability received from elsewhere (name it after its plugin: `annotation`, `stage`)    |
| `id` / `ids`                             | an opaque string identifier                                                                                                                                                          | object numbers, refs, keys                                                                |
| `ref`                                    | a typed engine reference (`PageRef`, `AnnotationRef`, `FormFieldRef`)                                                                                                                | DOM refs (`elementRef`), ids                                                              |
| `key`                                    | a string derived from a ref for map lookups (`annotationKey`, `encodePageKey`, `FieldKey`)                                                                                           | refs, ids                                                                                 |
| `dto`                                    | an engine DTO, only in code that converts DTOs                                                                                                                                       | model records                                                                             |
| `page`                                   | a `PageRef`                                                                                                                                                                          | a display index (`pageIndex`), an object number (`pageObjectNumber`), layout (`pageInfo`) |
| `pageIndex`                              | a zero-based display position                                                                                                                                                        | identity                                                                                  |
| `pageObjectNumber`                       | the scalar object-number foreign key (type `PageObjectNumber`)                                                                                                                       |                                                                                           |
| `objectNumber`                           | the number inside a ref of kind `'objectNumber'` (`PageRef`, `AnnotationRef`, `FormFieldRef`), and on a record that is the object itself (a form widget); the type says which object | a loose number whose object isn't obvious (name it: `pageObjectNumber`)                   |
| `record`                                 | an entry of a mirror (engine data held by a plugin)                                                                                                                                  | DTOs, overlay entries                                                                     |
| `event`                                  | a document or capability event                                                                                                                                                       | a DOM event in code that also handles document events (`domEvent`)                        |
| `dx`, `dy`                               | coordinate deltas                                                                                                                                                                    |                                                                                           |
| `url`, `uri`, `dpr`, `min`, `max`, `pdf` | themselves                                                                                                                                                                           |                                                                                           |

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
| `XSettings`                       | what a plugin reads with `getSettings()` and changes with `updateSettings()`    |
| `XDefinition`                     | what a register call takes: `PluginDefinition`, `CommandDefinition`             |
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
- No `DTO` in a public name: a read shape is named for what it is (`FormField`, `Signature`).
- Getters return `T | null` for "absent". Optional inputs and optional data
  fields use `?:`. One API never uses both `undefined` and `null` for the same
  meaning: [Nothing](#nothing-left-out-or-null) says which to use where.

## Nothing: left out or `null`

"Left out" is a key that isn't there (`?:`); "`null`" is the key, set to
`null`. These rules hold in every API: the engine's, the viewer's and the
HTTP contract.

- **Reads.** A field the API hands out (a response, a return value, a getter,
  an event, state, a setting) has one spelling for "nothing". A record's field
  is always there, `null` when there is nothing; left out is for a key that
  doesn't apply (a field another kind in the union has). Never `T | undefined`
  on a read.
- **Inputs take back what reads hand out.** Where a read can say `null`, an
  input that takes the same value accepts `null`, meaning "nothing". `null`
  never means "the default", and an input whose read is never `null` takes no
  `null`.
- **Creates.** Left out is the default; `null` is "nothing". A grouped
  caller's annotation create left without `groupId` goes in their group;
  `groupId: null` is no group, refused to a caller who has one.
- **Patches.** A top-level key left out keeps the value; `null` removes it.
  A field that can't change or be removed may carry the value a read gave
  back unchanged, which is no change; any other value is refused.
- **Objects inside a patch.** A value (a destination, a rect, a rich-text
  body, a file) is replaced whole: what it leaves out takes its default, never
  the current value. A map keyed by name (actions by trigger, custom metadata
  by key) is patched per key: left out keeps, `null` removes. Settings follow
  the same rule: a group (`chrome.outline`) merges per key, and a setting that
  is one value (a person, a box's look) is declared `whole` and replaced whole.
- **Options and parameters.** Left out is the default. `null` only for a value
  a read can hand out as `null`, or where `null` is a named value of its own
  (`move(ref, null)` moves to the top level). A parameter is `T | null` or
  optional, never both.

## Discriminated unions

- **`type`** tags things that happen: messages, events, effects.
- **`kind`** tags things that are: geometry, refs, borders, drafts, form fields.
- **`status`** tags what a call did: `{ status: 'executed' }`, `{ status: 'refused', reason }`,
  and an HTTP answer such as a document init's `{ status: 'deduped' }`.
- **`subtype`** is the one other tag: an annotation's, which is the PDF's own `/Subtype`.
- Tag values use one style per union (kebab-case or camelCase), never both.

`cloudpdf/contract/test/consistency.test.ts` checks the HTTP API's unions.

## The HTTP API

The contract (`cloudpdf/contract`) is what every SDK is generated from, so
its rules hold in every language:

- **Errors.** Every error response has one body,
  `{ "error": { "code", "message", "details"? } }` (`ErrorResponse`), and a
  refused change carries the same `error`. Codes come from one list,
  `EngineErrorCode`; a client reads a code it doesn't know as `Unknown`.
  `details` holds what a code carries, as the code's comment says.
- **Whole numbers are integers.** A count, an index, a size in bytes and a
  duration in seconds are `.int()`, so the SDKs type them as integers.
- **Sizes in bytes end in `Bytes`**, and a file's size is `sizeBytes`.
- **A hash names its algorithm**: `sha256`, `baseSha256`, `md5`.
- **Flags are named booleans**, flat on their object, never a bit word: the
  engine reads and writes the PDF's bits and the API names them.
- **Names are camelCase, without dots.** A path parameter is spelled out
  and follows the same rules (`docId`, `annotationKey`, `sha256`,
  `displaySha256`), as the SDKs name their arguments after it. A map keyed
  by name (custom metadata, a module's meters) keeps its keys as they are.
- **An object is named fields or a map, never both.** A map's entries get a
  field of their own (`metrics` and `moduleMeters`), so every SDK types
  them, instead of an "anything else" bag next to the fields.
- **Points in time are ISO 8601 strings** (`IsoDateTimeSchema`), named `…At`:
  a response says them in UTC (`…Z`), and a request gives them with an
  offset. Durations are whole seconds, named `…Seconds`. A calendar day
  (`YYYY-MM-DD`) is a date, not a point in time.
- **One spelling for "nothing".** A response field is either always there,
  `null` when there is nothing, or left out when there is nothing; never
  both. A create takes `null` only where its read can be `null`
  ([Nothing](#nothing-left-out-or-null)).

`cloudpdf/contract/test/consistency.test.ts` checks these on `openapi.json`.

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
| `destroy()`                            | End an object's life: free what it holds. Later calls refuse. Never `dispose()`.         |
| `on*` on a capability                  | An `EventHook`, named `on<Subject?><PastParticiple>`: `onFieldCreated`, `onZoomChanged`. |
| `on*` on a registration object         | A callback the capability calls, such as `InteractionHandler.onPointerDown`.             |

`i18n.t` is the one single-letter member, following the universal i18n convention.

### Shapes every plugin shares

- A page argument is `PageRef | number` (a ref or a display index); a read returns a `PageRef`.
- Every engine-backed plugin has `getStatus()`, `ensureLoaded()`, `refresh(): Promise<void>` and
  `onResynced`. Its confirmed-change events carry `origin: EventOrigin`, and a previous value is
  `previous<X>`.
- A create or update resolves a wrapper named after its noun (`{ annotation }`, `{ asset }`); each
  permission check is a `can<Verb>` twin taking the verb's arguments.
- `XDraft` is a document object's create input (`AnnotationDraft`, `FormFieldDraft`); `XInput` is
  any other create verb's.
- `documentId` is the viewer's open document; `docId` is the stored document.
- A number that only goes up is a `…Sequence`: `serverSequence`, `pagesSequence`.
- `src` is the document a viewer element or its config shows, HTML's word (`<img src>`); core and
  the engine say `source` (`open(source)`).
- `CommandDefinition`'s predicates are named after the field they compute (`enabled?(context)` gives
  `enabled`), an exception to "boolean functions are `is*`/`can*`".

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

The contract test checks the HTTP API's rules. Review covers the rest.
