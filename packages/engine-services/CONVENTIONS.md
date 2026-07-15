# engine-services conventions

`@embedpdf/engine-services` contains the synchronous, runtime-agnostic engine logic shared by
`@embedpdf/engine` and `@cloudpdf/server`.

The package should read like a small framework: a developer should know what a file does from its
directory before opening it.

## Top-level structure

```txt
src/
  runtime/           Low-level helpers for @embedpdf/pdf-runtime calls.
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
- Use `runtime` or `@embedpdf/pdf-runtime` terminology. Do not use upstream project names as
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

- Multi-step mutators validate all caller-controlled input and check cancellation before the first
  native write. After that apply boundary, caller validation and abort checks must not introduce a
  throw path: these mutations are not rollback-atomic.
- Ordered batch verbs do not throw after a write may have occurred. They record the current item as
  `failed`, mark remaining items `skipped`, and finalize whenever state changed or a native outcome
  is indeterminate. They return no mutation artifact only when every outcome is known not to have
  changed the document.
- A non-batch native failure after the apply boundary is an internal-invariant path, not a validation
  outcome. Never describe a multi-call mutation as atomic unless the native layer provides an actual
  transaction or rollback guarantee.

## Adding a feature

When adding a new worker capability:

1. Add the wire request/response types in `@embedpdf/engine-core`.
2. Add a `Reader` or `Mutator` under `features/<name>/`.
3. Put implementation details under `features/<name>/internal/`.
4. Add a small handler path in `worker-host/`.
5. Add local/server/cloud adapter changes only where the public engine API requires them.
6. Cover the behavior with conformance tests or focused package tests.
