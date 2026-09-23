import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvent, PageRef } from '@embedpdf/engine-core/runtime';
import { createTestContext } from '../src/testing';
import type { PageMirrorSpec } from '../src/index';

/**
 * Page mirrors: load on demand, share in-flight reads, never let an older
 * read overwrite a newer one, re-read or fold affected loaded pages, drop
 * deleted pages, and re-read everything loaded on a resync.
 */

const pageRef = (pageObjectNumber: number): PageRef => ({ kind: 'objectNumber', pageObjectNumber });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const origin = { kind: 'remote', sessionId: 'them', sub: null, ts: 0, serverId: null };
const touched = (pageObjectNumber: number) =>
  ({
    type: 'annotation.updated',
    page: pageRef(pageObjectNumber),
    origin,
  }) as unknown as DocumentEvent;

function setup(spec: Partial<PageMirrorSpec<string>> = {}) {
  const ctx = createTestContext({ id: 'probe' });
  const reads: { page: number; resolve(value: string): void }[] = [];
  const load = vi.fn(
    (_doc: unknown, page: PageRef) =>
      new Promise<string>((resolve) => reads.push({ page: page.pageObjectNumber, resolve })),
  );
  const mirror = ctx.pageMirror<string>({
    name: 'text',
    load,
    affected: (event) =>
      event.type === 'annotation.updated' ? [(event as unknown as { page: PageRef }).page] : null,
    ...spec,
  });
  return { ctx, mirror, load, reads };
}

describe('ctx.pageMirror', () => {
  it('loads a page on demand and shares an in-flight read', async () => {
    const { mirror, load, reads } = setup();
    expect(mirror.getStatus(pageRef(1))).toBe('idle');
    const first = mirror.ensureLoaded(pageRef(1));
    const second = mirror.ensureLoaded(pageRef(1));
    expect(load).toHaveBeenCalledTimes(1);
    expect(mirror.getStatus(pageRef(1))).toBe('loading');
    reads[0].resolve('page one');
    await Promise.all([first, second]);
    expect(mirror.get(pageRef(1))).toBe('page one');
    expect(mirror.getStatus(pageRef(1))).toBe('ready');
    await mirror.ensureLoaded(pageRef(1));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never lets an older read overwrite a newer one', async () => {
    const { mirror, reads } = setup();
    void mirror.ensureLoaded(pageRef(1));
    void mirror.refresh(pageRef(1));
    reads[1].resolve('newer');
    await settle();
    reads[0].resolve('older');
    await settle();
    expect(mirror.get(pageRef(1))).toBe('newer');
  });

  it('re-reads an affected loaded page and ignores pages that never loaded', async () => {
    const { ctx, mirror, load, reads } = setup();
    void mirror.ensureLoaded(pageRef(1));
    reads[0].resolve('v1');
    await settle();
    ctx.emitDocumentEvent(touched(1));
    ctx.emitDocumentEvent(touched(2));
    expect(load).toHaveBeenCalledTimes(2);
    reads[1].resolve('v2');
    await settle();
    expect(mirror.get(pageRef(1))).toBe('v2');
    expect(mirror.getStatus(pageRef(2))).toBe('idle');
  });

  it('folds an event into a page when the spec can apply it', async () => {
    const { ctx, mirror, load, reads } = setup({ fold: (value) => `${value}+event` });
    void mirror.ensureLoaded(pageRef(1));
    reads[0].resolve('v1');
    await settle();
    ctx.emitDocumentEvent(touched(1));
    expect(load).toHaveBeenCalledTimes(1);
    expect(mirror.get(pageRef(1))).toBe('v1+event');
  });

  it('drops deleted pages and re-reads loaded pages on a resync', async () => {
    const changed = vi.fn();
    const { ctx, mirror, load, reads } = setup({ changed });
    void mirror.ensureLoaded(pageRef(1));
    void mirror.ensureLoaded(pageRef(2));
    reads[0].resolve('one');
    reads[1].resolve('two');
    await settle();
    ctx.emitDocumentEvent({
      type: 'pages.deleted',
      pages: [pageRef(2)],
      origin,
    } as unknown as DocumentEvent);
    expect(mirror.getStatus(pageRef(2))).toBe('idle');
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ cause: 'drop', previous: 'two', next: undefined }),
    );
    ctx.emitDocumentEvent({
      type: 'stream.desynced',
      reason: 'backlog-overflow',
      ts: 0,
    } as DocumentEvent);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls[2][1]).toEqual(pageRef(1));
  });
});
