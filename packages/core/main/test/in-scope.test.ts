import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { createCapabilityToken } from '../src/index';
import { createKernel } from '../src/kernel';
import { DocumentsToken, type AnyPlugin, type PluginContext } from '../src/types';
import { bytesInput, immediateEngine, makeHandle, page } from './helpers';

/**
 * Workspace plugins follow the document in scope: resolved for a document, a workspace
 * capability is the view its plugin declares (`inScope`), where calls that leave out the
 * document use that one instead of the active one.
 */

interface TargetApi {
  /** The document a call without one acts on. */
  targetOf(documentId?: string): string | null;
}
const TargetToken = createCapabilityToken<TargetApi>('target');

const targetPlugin: AnyPlugin = {
  id: 'target',
  token: TargetToken,
  create: (ctx: PluginContext<unknown>) => ({
    api: {
      targetOf: (documentId) => documentId ?? ctx.get(DocumentsToken).getActiveId(),
    } satisfies TargetApi,
  }),
  inScope: (target: TargetApi, documentId: string): TargetApi => ({
    targetOf: (id = documentId) => target.targetOf(id),
  }),
};

/** Two documents with different pages and permissions; `b` is active. */
async function twoDocuments(plugins: AnyPlugin[] = [targetPlugin]) {
  const handles: Record<string, DocumentHandle> = {
    a: {
      ...makeHandle('a', [page(1, 0), page(2, 1)]),
      security: { allows: () => false },
      download: () => Promise.resolve(new Uint8Array([0xa])),
    } as unknown as DocumentHandle,
    b: {
      ...makeHandle('b', [page(7, 0)]),
      download: () => Promise.resolve(new Uint8Array([0xb])),
    } as unknown as DocumentHandle,
  };
  const kernel = createKernel({ engine: immediateEngine(handles), plugins });
  await kernel.start();
  await kernel.documents.open(bytesInput('a'));
  await kernel.documents.open(bytesInput('b'));
  expect(kernel.documents.getActiveId()).toBe('b');
  return kernel;
}

describe('a workspace plugin in a document scope', () => {
  it('uses the document in scope for calls that leave it out, and the active one outside', async () => {
    const kernel = await twoDocuments();
    expect(kernel.capability(TargetToken, 'a').targetOf()).toBe('a');
    expect(kernel.capability(TargetToken, 'a').targetOf('b')).toBe('b'); // a named document wins
    expect(kernel.capability(TargetToken).targetOf()).toBe('b');
    expect(kernel.tryCapability(TargetToken, 'a')?.targetOf()).toBe('a');
    await kernel.destroy();
  });

  it('is the same object on every call for one document, and another for each document', async () => {
    const kernel = await twoDocuments();
    const inA = kernel.capability(TargetToken, 'a');
    expect(kernel.capability(TargetToken, 'a')).toBe(inA);
    expect(kernel.tryCapability(TargetToken, 'a')).toBe(inA);
    expect(kernel.capability(TargetToken, 'b')).not.toBe(inA);
    expect(kernel.capability(TargetToken)).not.toBe(inA);
    expect(kernel.capability(TargetToken)).toBe(kernel.capability(TargetToken));
    await kernel.destroy();
  });

  it('drops the view when the document closes, and builds a new one when it opens again', async () => {
    const kernel = await twoDocuments();
    const inA = kernel.capability(TargetToken, 'a');
    await kernel.documents.close('a');
    // A document the kernel doesn't know has no scope: the capability itself.
    expect(kernel.capability(TargetToken, 'a')).toBe(kernel.capability(TargetToken));
    await kernel.documents.open(bytesInput('a'));
    const reopened = kernel.capability(TargetToken, 'a');
    expect(reopened).not.toBe(inA);
    expect(reopened.targetOf()).toBe('a');
    await kernel.destroy();
  });

  it('is what a document-scoped plugin resolves, for its own document', async () => {
    const ReaderToken = createCapabilityToken<{ target(): string | null }>('reader');
    const readerPlugin: AnyPlugin = {
      id: 'reader',
      scope: 'document',
      token: ReaderToken,
      requires: [TargetToken],
      create: (ctx: PluginContext<unknown>) => ({
        api: { target: () => ctx.get(TargetToken).targetOf() },
      }),
    };
    const kernel = await twoDocuments([targetPlugin, readerPlugin]);
    expect(kernel.capability(ReaderToken, 'a').target()).toBe('a');
    await kernel.destroy();
  });
});

describe('the documents capability in a document scope', () => {
  it('reads the document in scope, and the active one outside', async () => {
    const kernel = await twoDocuments();
    const inA = kernel.capability(DocumentsToken, 'a');
    expect(inA.listPages()).toBe(kernel.documents.listPages('a'));
    expect(inA.getPageAt(1)?.ref).toEqual(page(2, 1).ref);
    expect(inA.getPage(page(7, 0).ref)).toBeNull(); // b's page
    expect(inA.getPageIndex(page(2, 1).ref)).toBe(1);
    expect(inA.getRevision()).toBe(0);
    expect(inA.allows('doc.print')).toBe(false);

    expect(kernel.documents.listPages()).toHaveLength(1); // the active document, b
    expect(kernel.documents.allows('doc.print')).toBe(true);
    expect(inA.listPages('b')).toBe(kernel.documents.listPages('b')); // a named document wins
    await kernel.destroy();
  });

  it('saves the document in scope', async () => {
    const kernel = await twoDocuments();
    expect(await kernel.capability(DocumentsToken, 'a').save()).toEqual(new Uint8Array([0xa]));
    expect(await kernel.documents.save()).toEqual(new Uint8Array([0xb]));
    await kernel.destroy();
  });

  it('keeps the registry calls and events of the capability itself', async () => {
    const kernel = await twoDocuments();
    const inA = kernel.capability(DocumentsToken, 'a');
    expect(inA).toBe(kernel.tryCapability(DocumentsToken, 'a'));
    expect(inA).not.toBe(kernel.documents);
    expect(kernel.capability(DocumentsToken)).toBe(kernel.documents);
    expect(inA.getActiveId()).toBe('b');
    expect(inA.onClosed).toBe(kernel.documents.onClosed);
    inA.setActive('a');
    expect(kernel.documents.getActiveId()).toBe('a');
    await kernel.destroy();
  });
});
