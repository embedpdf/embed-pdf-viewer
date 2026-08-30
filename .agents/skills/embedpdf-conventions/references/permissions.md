# Permissions — the law for authorization-aware plugins

[`plugins.md`](./plugins.md) is the law for a plugin's shape; this file is the law for how a
plugin answers **"may this session do that?"** — so every viewer built on the
plugins, ours or a host's, renders a truthful UI instead of offering actions
the engine will refuse.

## The four layers, one direction

```
1. ENGINE / SERVER        enforces   scope + collab grammar + PDF bits (ScopeGuard, routes)
2. SECURITY SERVICE       mirrors    doc.security.allows(cap) + the per-record collab mirrors
3. PLUGIN CAPABILITY      translates verbs → capabilities; gates; exposes twins
4. CHROME / HOST UI       renders    from the plugin's twins only
```

Each layer consumes only the layer below. A UI never touches scope strings or
`allows()` directly — what a verb requires is the owning plugin's knowledge
(search `'full'` needs `doc.text.search` **and** `doc.text.copy`; only the
search plugin should know that). The one sanctioned exception: a kernel/chrome
feature with no owning plugin and a 1:1 capability (print, download) may read
`allows()` directly.

## The twin law

> **Every verb that can refuse ships a `can` twin: same name, same arguments,
> boolean, answering "would this verb succeed right now for this session?"**
>
> The twin composes everything the verb itself checks — authority (scope),
> document flags (`locked`, `lockedContents`, `/F` states), and structural
> preconditions (selection composition) — and excludes the active tool: twins
> are facts; mode gates whether affordances render at all, orthogonally.
> Verbs that cannot refuse get no twin.

Why twins and not a `permissions()` bag or a generic `can('verb')`:

- **Arity fidelity.** Questions have the same argument shape as their
  operations (`canDelete(ref)`, `canSearch(mode)`). A bag cannot hold
  argument-taking questions; twins cover every case with one rule.
- **Drift resistance.** The twin lives next to its verb and changes in the
  same diff; the 1:1 name/signature mapping admits a mechanical conformance
  test: _calling a gated verb while its twin is false must refuse._
- **Zero-judgment derivation.** The convention is a function, not a style
  guide: verb name → `can` prefix → same signature. Nothing to decide for
  any future plugin — which is how shape drift is prevented, not policed.

Bags may exist only as derived conveniences bundling twins for
one-subscription UIs (`comments.permissionsFor(ref)` is the precedent). They
never define answers of their own.

**The collapse rule.** Twins mirror ANSWERS, not method names: when every
verb in a family would compute the identical expression (one authority, no
flags, no argument variance), the family ships ONE twin named for the family
— `pageEdit.canEdit()` covers rotate/move/delete/insert/addBlank, because
`doc.pages.assemble` is their one shared answer and PDF itself has one
assemble bit. Two twins may never compute the same expression (two names for
one fact is drift surface); the moment an answer diverges — a capability
split, per-argument structure — the twin splits with it, in the same diff.

## Gate the optimistic, hide the rest

A client-side check inside the verb is REQUIRED only where the verb creates
local/optimistic state or drives a gesture (annotation paint, form fill,
page reorder, redaction marks, render tile fetches): there, a late engine 403
leaves a lying UI or a zombie record, so the verb self-refuses at the
capability entry — gestures go inert; imperative calls reject with the same
`PermissionDenied` shape the engine throws. Pure-request verbs (search, text
read) need no client gate: hiding the affordance is the UX and the engine is
the enforcement — a duplicate check is drift surface.

Failed engine writes must still roll the optimistic state back. The gate makes
refusals rare (races, stale access); rollback keeps the model honest when they
happen anyway.

## Per-record authority (the ownership extension)

Where records carry owners (annotations via the collab grammar — future
entities slot into the same grammar), the doc-level booleans are not enough.
The owning plugin **projects this session's authority onto each record at
ingest** (`authority: { update, delete }`, asked of the security mirrors with
the record's stamped owner — the same inputs the server checks) and **fuses it
into the same predicate that already gates flags** (`annotTransformable`).
Presentation and behavior then agree by construction: a record you may not
edit renders the bare outline `locked` already renders — no handles, no knob,
no drag — and other people's records under an `annotations:update:self` grant
are selectable and commentable but immovable, per record, with no special
code.

Authority is model-owned derived state (like `apVersion`), session-stable, and
re-stamped when security state changes (owner unlock, `/access` refresh).

## Reactivity

Twins are pure reads, cheap enough to derive per call; UIs subscribe through
selectors (`useSelector(Token, c => c.canFoo())` — boolean equality is free).
Twins with structural inputs flip on selection changes, not just security
changes: subscribe, don't cache. A security-state change must tick the store
so every twin's subscribers re-render.

## Current twin registry (as built)

| Capability       | Twins                                                                                           | Composes from                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| annotation       | `canRead()` · `canCreate()` · `canEdit(ref)` · `canDelete(ref)` · `canGroup()` · `canUngroup()` | `doc.annotate.read` / collab mirrors + flags + structure                                                                                                                                      |
| comments         | `permissionsFor(ref)` (convenience bag of twins)                                                | the annotation twins                                                                                                                                                                          |
| selection        | `canSelect()` · `canCopy()`                                                                     | `doc.text.select` / `doc.text.copy`                                                                                                                                                           |
| search           | `canSearch(mode?)`                                                                              | `doc.text.search`; `'full'` also `doc.text.copy` (a snippet reproduces text). No verb gate — pure request.                                                                                    |
| render           | `canRender()`                                                                                   | `doc.render`; gate case: `renderPage` AND tile fetches refuse locally (else a denied viewport 403s per tile, forever)                                                                         |
| page-edit        | `canEdit()` — the collapse rule                                                                 | `doc.pages.assemble` (rotate/move/delete/insert are ONE answer; PDF has one assemble bit)                                                                                                     |
| form             | `canRead()` · `canFill()` · `canDesign()`                                                       | `doc.forms.read` (hydration gate) / `doc.forms.fill` (fused into `FillItem.disabled` + write/reset gates) / `doc.forms.modify` (place/update/delete/detach; the draw-to-place handler's gate) |
| redaction        | `canMark()` · `canApply()`                                                                      | marks are annotations ⇒ `canMark` IS `annotation.canCreate()`; apply mirrors ALL THREE engine assertions: `doc.redact` ∧ `doc.pages.modify` ∧ `doc.annotate.modify` (+ engine support)        |
| kernel documents | `allows(cap, id?)`                                                                              | THE 1:1 exception surface: chrome print/download read `documents.allows('doc.print' / 'doc.download')` — the verbs live on the kernel, no owning plugin                                       |
