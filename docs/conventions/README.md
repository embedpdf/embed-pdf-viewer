# Conventions

How the EmbedPDF client stack is built, and the rules every change follows.
These documents describe the code as it is. When the code and a document
disagree, fix one of them in the same pull request.

Start with this page, then read [`architecture.md`](./architecture.md).

## The model

A plugin provides one capability per scope (the workspace, or each open
document). The capability is its only public surface: synchronous reads,
verbs that do work, and events. A plugin talks to the engine only through
`ctx.doc`, and to other plugins only through their capabilities.

### Four kinds of state

| Kind     | What it is                                                 | Home                                                    | How it changes                                                      |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Mirror   | A local copy of data the engine owns                       | `ctx.mirror(spec)`, `ctx.pageMirror(spec)`              | Only by folding confirmed engine events (every origin) and by loads |
| Overlay  | A local change the engine has not confirmed yet            | session state, keyed by what its confirmation carries   | Added by a verb or gesture; dropped on confirmation or failure      |
| Session  | State the client owns that is not in the PDF               | `ctx.state`                                             | Only through named pure transitions in `model.ts`                   |
| Resource | Handles, rasters, workers, registries of functions, caches | closures, owned through `ctx.cleanup` and `ctx.acquire` | Any way; readers are woken with `ctx.notify()`                      |

### Three kinds of events

| Kind         | Meaning                              | Fired from                                                            |
| ------------ | ------------------------------------ | --------------------------------------------------------------------- |
| Fact         | Something changed in the document    | Where the confirmed document event is applied, with `originOf(event)` |
| State change | A session value changed              | The plugin's one `ctx.state.onChange` listener                        |
| Occurrence   | An operation ran, finished or failed | Where the operation reaches that point                                |

## Core rules

1. A capability is a plugin's only public surface. Other plugins and adapters
   read through it, never through a plugin's state.
2. Every piece of state has one kind and one home: mirror, overlay, session
   or resource. State is plain data; everything else is a resource.
3. A mirror changes only by its fold and by loads. Its fold is pure and the
   same for every origin. Verbs never write it.
4. Session state changes only through named pure transitions applied with
   `ctx.state.update`. A transition that returns the same object changes
   nothing.
5. A verb calls the engine and returns. The engine publishes the confirmed
   event before the call resolves, so the verb's `await` already sees its own
   write: no refetch, no waiting, no hand-made events.
6. Every event fires from exactly one place. Fact events carry
   `originOf(event)`; no plugin builds an origin by hand. Loads announce
   `onResynced`.
7. Reads are synchronous, pure and identity-stable (`memo`, `memoByKey`).
   They never start engine work.
8. A plugin declares every token it resolves in `requires` or `optional`, and
   imports sibling tokens from their `/contract` entries.
9. Registrations with siblings and subscriptions happen in `connect`, and
   everything acquired is owned: `ctx.cleanup`, `ctx.listen`, `ctx.acquire`.
10. A capability rejects with `PluginError` only, and every verb that can
    refuse has a `can*` twin.
11. Names and comments follow [`naming.md`](./naming.md) and
    [`comments.md`](./comments.md).

## Map

| File                                                     | Covers                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`architecture.md`](./architecture.md)                   | Layers, scopes and bring-up, the four kinds of state, data flow, reads, reactions, pure cores, plugin anatomy                            |
| [`state-and-sync.md`](./state-and-sync.md)               | `ctx.state`, `notify`, `watch`, `waitFor`, mirrors, page mirrors, overlays, resources, reactions, the sync rules                         |
| [`events.md`](./events.md)                               | Fact, state-change and occurrence events, event sources, naming, `ChangeOrigin`, `onResynced`, subscribing                               |
| [`plugins.md`](./plugins.md)                             | Plugin files, manifest, tokens and contracts, package entries, controller, `connect`, dependencies, lifetime, errors, a complete example |
| [`testing.md`](./testing.md)                             | Where tests live, the test context, fake engines, mirror tests, kernel tests, conformance suites, type tests                             |
| [`naming.md`](./naming.md)                               | Identifiers, the glossary, type suffixes, the capability vocabulary                                                                      |
| [`comments.md`](./comments.md)                           | What a comment may say, and how it is checked                                                                                            |
| [`packages.md`](./packages.md)                           | Where a package lives and what it is called                                                                                              |
| [`permissions.md`](./permissions.md)                     | Authorization-aware plugins: `can*` twins, gates, per-record authority                                                                   |
| [`viewer-doors.md`](./viewer-doors.md)                   | One viewer, several deliveries: the entry points that choose the engine                                                                  |
| [`engine-services.md`](./engine-services.md)             | Layout of `@embedpdf/engine-services`: readers, mutators, the worker host                                                                |
| [`runtime-confinement.md`](./runtime-confinement.md)     | Thread-confined PDFium: per-thread state, the worker pool, the threading gate                                                            |
| [`engine-host-isolation.md`](./engine-host-isolation.md) | Running engines in supervised child processes, and the threat model                                                                      |
| [`server-adapters.md`](./server-adapters.md)             | The CloudPDF server's adapter families: secrets, KMS, storage, CDN, import                                                               |
| [`server-migrations.md`](./server-migrations.md)         | Forward and rollback database migrations for the CloudPDF server                                                                         |
| [`docs-architecture.md`](./docs-architecture.md)         | How the documentation site renders one source per framework                                                                              |

Package build and export rules are in
[`tooling/build/README.md`](../../tooling/build/README.md). Changesets are
described in [`.agents/skills/embedpdf-changesets/SKILL.md`](../../.agents/skills/embedpdf-changesets/SKILL.md).
