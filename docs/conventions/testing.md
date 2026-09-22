# Testing

Where tests live, which layer to test at, and the tools the kernel and the
engine provide for it.

## Where tests live

- A package's tests live in `test/`, next to `src/`, in the same structure:
  `src/sync/records.ts` is tested in `test/sync/records.test.ts`. Tests that
  run several areas together are named `*.integration.test.ts`; shared
  fixtures and helpers go in `test/fixtures/` and `test/helpers/`.
- Test names are sentences that describe behavior.
- Tests run with Vitest: `pnpm --filter <package> test`, or `pnpm test` for
  the whole repository.
- Vitest does not typecheck. `pnpm typecheck` checks a package's tests when
  its `tsconfig.json` lists `test` in `include`, as most plugins do.

## Pick the layer

| What                                        | How                                                           |
| ------------------------------------------- | ------------------------------------------------------------- |
| Transitions, projections, folds             | Call the pure functions in `model.ts` (or `sync/`) directly.  |
| A controller: reads, verbs, events, mirrors | `createTestContext` from `@embedpdf/core/testing`.            |
| Bring-up, dependencies, document lifecycle  | `createKernel` with a fake engine.                            |
| Engine behavior plugins rely on             | A conformance suite from `@embedpdf/engine-core/conformance`. |

## The test context

`createTestContext(options)` returns a real `PluginContext`: the kernel's own
store, state cell, mirrors, page mirrors and event sources, page geometry
built from a page list, capabilities from a token map, and a document handle
shaped by the test.

| Option         | Meaning                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | The plugin id (`ctx.id`, error messages). Default `'test'`.                                                                                                                      |
| `state`        | The initial session state; omit for a stateless plugin.                                                                                                                          |
| `pages`        | The document's pages: `{ ref, size?, crop?, rotation?, userUnit?, label? }`. `document()`, `getPage` and `geometry` derive from them.                                            |
| `capabilities` | `[token, capability]` pairs that `get` and `tryGet` resolve.                                                                                                                     |
| `doc`          | The document handle members the test uses (`metadata`, `forms`, `page`, …). The default has an event stream and `security.allows` answering true. `null` for a workspace plugin. |
| `documentId`   | Default `'doc'`.                                                                                                                                                                 |
| `engine`       | The `ctx.engine` members the test uses.                                                                                                                                          |

The returned context adds:

| Member                     | Behavior                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `connect(instance)`        | Does what the kernel does after `create`: runs `connect`, then starts the mirrors' first loads. Returns the `api`. |
| `emitDocumentEvent(event)` | Delivers a confirmed document event through the default `doc.events`.                                              |
| `subscribe(listener)`      | Observes the change stream (state updates and `notify`).                                                           |
| `capabilities`             | The token map, to add or replace capabilities during a test.                                                       |
| `dispose()`                | Aborts the lifetime and runs every registered cleanup.                                                             |

Unless the test passes its own, `DocumentsToken` resolves to a read-only
registry holding the one document; its mutating verbs throw `unsupported`. The
test context does not check declared dependencies; a test through
`createKernel` does.

The smallest harness (`packages/plugin/shell/test/shell.test.ts`):

```ts
const harness = () => {
  const ctx = createTestContext({ id: 'shell', state: initialShellState() });
  return ctx.connect(createShellController(ctx));
};
```

A harness for a plugin with a mirror, here the title plugin from
[`plugins.md`](./plugins.md#a-minimal-complete-plugin):

```ts
import type {
  DocumentEvent,
  DocumentHandle,
  DocumentMetadata,
} from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import { createTitleController } from '../src/controller';
import { foldTitle, initialTitleState } from '../src/model';

const origin = (kind: 'local' | 'remote') => ({
  kind,
  sessionId: kind === 'local' ? 'me' : 'them',
  sub: null,
  ts: 0,
  serverId: null,
});

const titleUpdated = (
  title: string,
  kind: 'local' | 'remote',
): DocumentEvent => ({
  type: 'metadata.updated',
  origin: origin(kind),
  metadata: { title } as DocumentMetadata,
  cache: null,
});

function harness(initial: string | null) {
  let metadata = { title: initial } as DocumentMetadata;
  const ctx = createTestContext({
    id: 'title',
    state: initialTitleState(),
    doc: {
      metadata: {
        read: async () => metadata,
        update: async (patch: { title?: string | null }) => {
          metadata = { ...metadata, title: patch.title ?? null };
          // Like both engines: the confirmed event is published before the promise settles.
          ctx.emitDocumentEvent(titleUpdated(metadata.title!, 'local'));
          return { metadata, cache: null };
        },
      },
    } as unknown as Partial<DocumentHandle>,
  });
  return { ctx, title: ctx.connect(createTitleController(ctx)) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('foldTitle', () => {
  it('takes the title from metadata.updated and ignores other events', () => {
    expect(foldTitle('Draft', titleUpdated('Final', 'remote'))).toBe('Final');
    expect(foldTitle('Draft', { type: 'pages.rotated' } as DocumentEvent)).toBe(
      'Draft',
    );
  });
});

describe('title controller', () => {
  it('sees its own write when setTitle resolves', async () => {
    const { title } = harness('Draft');
    await settle();
    const localities: string[] = [];
    title.onTitleChanged((event) => localities.push(event.origin.locality));
    await title.setTitle('Final');
    expect(title.getTitle()).toBe('Final');
    expect(localities).toEqual(['local']);
  });

  it("applies another session's change through the same fold", async () => {
    const { ctx, title } = harness('Draft');
    await settle();
    ctx.emitDocumentEvent(titleUpdated('Theirs', 'remote'));
    expect(title.getTitle()).toBe('Theirs');
  });
});
```

## Fake engines publish before they resolve

Both engines publish the event for a session's own mutation before the
mutation's promise settles, and plugins depend on it: a verb's `await` sees
its own write. A fake document handle does the same. A fake that resolves
first, or never publishes, tests a system that does not exist.

```ts
// packages/plugin/metadata/test/metadata.test.ts
update: vi.fn(async (patch: { title?: string | null }) => {
  const metadata = META({ title: patch.title ?? null });
  const result = { metadata, cache: null };
  // Like both real engines: the confirmed event is published before the promise settles.
  emit({ type: 'metadata.updated', origin, ...result });
  return result;
}),
```

## Mirror tests

- **Fold tests.** A fold is a pure function; test each event case directly,
  including the ones that return the value unchanged and the ones that ask for
  a reload (`expect(fold(value, event)).toEqual(reload({ pages }))`).
  `packages/plugin/annotation/test/sync/records.test.ts` is the reference.
- **Parity tests.** The same event with `origin.kind: 'local'` and with
  `'remote'` produces the same mirror value. Origin may change presentation,
  never data.
- **No refetch.** Count the engine's reads: a mirror reads once when it loads,
  not again after a write (`packages/plugin/form/test/fields-mirror.test.ts`).
- **Events.** A write fires its fact event once, with the right origin; a load
  fires `onResynced` and no per-item events.

The kernel tests the mirror protocol itself (loading after connect, queueing
and cursor replay, failures, resyncs, coalescing, closing) in
`packages/core/main/test/mirror.test.ts` and `page-mirror.test.ts`; a plugin
does not repeat those tests.

## Kernel tests

A test that needs bring-up, dependency resolution or the document lifecycle
creates a real kernel with a fake engine and opens a document:

```ts
const kernel = createKernel({
  engine,
  plugins: [interactionPlugin(), formPlugin()],
});
await kernel.start();
await kernel.documents.open({
  kind: 'bytes',
  id: 'd',
  bytes: new Uint8Array(),
});
const form = kernel.capability(FormToken, 'd');
```

Destroy the kernel at the end of the test (`await kernel.destroy()`).

## Engine conformance suites

`@embedpdf/engine-core/conformance` exports one suite per engine feature
(`runDocumentEventsConformance`, `runFormConformance`,
`runAnnotationMutationConformance`, …). Each takes a test runner and options,
and every engine runs every suite: the local engine in
`packages/engine/main/test/`, the cloud engine in `cloudpdf/engine/test/`, both
in the engine conformance workflow in CI. Behavior a plugin relies on is
pinned by a conformance test, so both engines must provide it.
`runDocumentEventsConformance` checks that every confirmed mutation publishes
exactly one event with the caller's result, that failed mutations publish
nothing, that own mutations are `local` with a stable session id, that
unsubscribing stops delivery, and that own mutations are published before
their promise settles.

## Type tests

A test file may assert that a shape does not compile with
`// @ts-expect-error`. If the shape starts compiling, `pnpm typecheck` fails
with an unused-directive error, so the assertion cannot rot
(`packages/plugin/annotation/test/tools/definitions.test.ts`). This works in
packages whose `tsconfig.json` includes `test`.
