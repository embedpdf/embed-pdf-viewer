# engine-services conventions

`@embedpdf/engine-services` contains the synchronous, runtime-agnostic engine logic shared by
`@embedpdf/engine` and `@cloudpdf/server`.

The package should read like a small framework: a developer should know what a file does from its
directory before opening it. Paths below are relative to
`packages/engine/services/` unless they start at the repository root.

## Top-level structure

```txt
src/
  runtime/           Low-level helpers for @embedpdf/engine-runtime calls.
  shared/            Generic helpers used across layers.
  document-session/  Lifetime and identity state for one open document.
  features/          Business-level document capabilities.
  worker-host/       Worker wire dispatch and request orchestration.
```

Dependencies flow downward:

```txt
runtime/shared -> document-session -> features -> worker-host
```

`document-session/` must not import from `features/`. Feature code may use a `DocumentSession`;
the session layer should stay focused on open-document state, page identity, page handles, and
revision bookkeeping.

## Feature modules

Each feature follows the same shape:

```txt
feature-name/
  FeatureReader.ts
  FeatureMutator.ts      # only when the feature changes document state
  internal/
    ...
  index.ts
```

Rules:

- Use `Reader` for read-only orchestration.
- Use `Mutator` for business-level document changes.
- Put helper functions, registries, per-subtype codecs, and low-level runtime details in
  `internal/`.
- `index.ts` exports only the feature's public orchestration surface.
- Avoid root-level helper files beside a reader or mutator; if it is not an entry point, it belongs
  under `internal/`.

## Naming

- Public orchestration classes use `PascalCase.ts`: `MetadataReader.ts`, `PagesMutator.ts`.
- Internal helper modules use descriptive verb phrases: `readMetadataText.ts`,
  `writeTextMarkupAnnotation.ts`, `computeMutationImpact.ts`.
- Avoid generic names like `util.ts`, `helpers.ts`, or `registry.ts` unless they live under an
  already-specific folder and still read clearly.
- Use `runtime` or `@embedpdf/engine-runtime` terminology. Do not use upstream project names as
  directory names.

## Worker boundary

`worker-host/WorkerHost.ts` is the public host entry used by local workers, inline transports, and
server worker threads. It should own:

- request envelopes;
- abort controller tracking;
- resolve/reject serialization;
- session lookup and close/shutdown routing.

Feature behavior belongs in `features/`, not in worker adapters.

## Mutation safety

- Every job whose effect is `write` or `contentWrite` runs as one layer transaction, begun and ended
  in `WorkerHost.run` (a signing's `signatures.complete` is the exception: it replaces the
  document's bytes instead). The transaction commits in `finishMutation`, before the layer is saved; any throw before
  that aborts it, and the document and the derived caches are as they were. A
  writer never begins, commits or rolls back on its own.
- A commit or an abort that fails leaves the session unusable: every later job is refused with
  `DocNotOpen`, and the document has to be opened again.
- Mutators still validate caller input and check cancellation before the first native write: a
  refusal costs no copies, and the error names the caller's mistake.
- A check that depends on the document runs inside the write, against what the write reads: the
  caller's authority over an annotation's owner (`AnnotationAuthority`), the members of a thread a
  delete takes. No read job runs before a write to check it.
- Writers find annotations from the page's dictionaries (raw handles), so a write never parses a
  page's content unless it writes that content (flatten, redaction).
- A write that moves entries of a page's `/Annots` (a delete, a reorder, a flatten, a redaction, a
  merged field's split) calls `promoteInlineAnnotations` first, before it loads the page: an inline
  annotation is named by its position only while no entry has moved.
- A batch is all or nothing too: redaction apply and page flatten throw when a page fails or the
  call is cancelled, and their per-page results only say `applied` or `unchanged`.
  `forms.applyEffects` is the exception: it still reports a failed effect and skips the rest, and
  the transaction commits what its result reports.
- Writes bump `cacheSeq` (derived caches) as they go; `finishMutation` bumps `editsSeq` (unsaved
  edits, the signing version) once per committed write.

## Adding a feature

When adding a new worker capability:

1. Add the wire request/response types in `@embedpdf/engine-core`.
2. Add a `Reader` or `Mutator` under `features/<name>/`.
3. Put implementation details under `features/<name>/internal/`.
4. Add a small handler path in `worker-host/`.
5. Add local/server/cloud adapter changes only where the public engine API requires them.
6. Cover the behavior with conformance tests or focused package tests.
