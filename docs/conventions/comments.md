# Comments

A comment explains what the code cannot say: why it is this way, what must
stay true, what a specification requires, or what surprising input looks like.
It is written for a developer who has only this repository in front of them.

## Rules

1. **Self-contained.** A comment never depends on anything outside the
   repository. Never cite plans, decision numbers, phases, gates, work
   packages, internal section numbers, reviews, chats or tickets. If a rule
   matters, state it in the comment, or in a committed document and link that
   document by its repository path.
2. **Allowed references:**
   - external specifications with a section: `ISO 32000-2 §12.5.6.3`, `RFC 3161`;
   - the observable behavior of external products: `matches Acrobat: …`;
   - committed documents by path: `docs/conventions/state-and-sync.md`;
   - code symbols with `{@link Symbol}`.
3. **Present tense, current behavior.** No history: not "v2 behaviour",
   "matches v2", "the old mistake", "used to", "as before", "legacy",
   "interim" or "for now". The engine is "the engine", not "the v3 engine".
   Migration notes belong in changesets and the migration guide.
4. **No roadmap.** Future work is `TODO(#123): …` pointing at a GitHub issue,
   or it is not in the code.
5. **One owner per explanation.** Explain an invariant once, where it is
   enforced. Elsewhere, link to that symbol instead of repeating it.
6. **Public API is documented with TSDoc.** Every member of `contract.ts` and
   `host-contract.ts` gets:
   - a one-sentence summary;
   - the `PluginError` codes it rejects with and the events it fires, when it has any;
   - `@param`/`@returns` only when the names do not already say it.
7. **Length:**
   - inline comments: one to four lines;
   - a module header: what the module is responsible for, in at most about ten lines;
   - longer design explanations go into `docs/conventions/` or a package README, linked from the code.
8. **Tone.** No ALL-CAPS for emphasis; acronyms are fine. If something must
   never happen, write "must not", and back it with a type or a test.
9. **No commented-out code, no names of people, and no dates**, unless the date
   is part of a specification or protocol.
10. **Section dividers** (`// ── reads ──`) are allowed in files over roughly
    150 lines. Always use this format.

## Examples

| Instead of | Write |
|---|---|
| `// the snapshot can never settle stale (G5).` | `// Queue one more read, so the snapshot never settles on data older than the last invalidation.` |
| `// the nine members the authoring pattern needs (see the road-to-3.0 plan, §5.10)` | `// The guarded document handle, page geometry, mirrors, events and lifetime helpers, all bound to one instance.` |
| `// Faint reference cross, prominent live indicator (v2 feel).` | `// A faint reference cross and a prominent live indicator.` |
| `// feeding it a units conversion (the old mistake) shrank bodies` | `// A px-per-point scale here would shrink screen-anchored bodies at 100% zoom; this is a zoom ratio.` |
| `// Phase 3's shared ScriptHost swaps in by re-registering` | Describe what the code does now, and nothing else. |
| `// The ONE place the value changes` | `// The only place the value changes` |

## Enforcement

`pnpm check:comments` runs in CI. It reads comments with the TypeScript
scanner and rejects:
- plan and phase vocabulary;
- internal section numbers (`§` without an ISO, PDF or RFC citation);
- links to `.md` files that do not exist;
- version-history references;
- `TODO`s without an issue number;
- ALL-CAPS emphasis.

Justified exceptions go in `scripts/check-comments.allow`, one per line with a reason.
