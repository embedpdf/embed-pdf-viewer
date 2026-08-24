import { describe, expect, it, vi } from 'vitest';
import { createMetadataCapability } from '../src/capability';
import { registerMetadataEffects } from '../src/effects';
import { initialMetadataState, metadataReducer } from '../src/reducer';
import type { DocumentMetadata } from '@embedpdf/core';

const META = (over: Partial<DocumentMetadata> = {}): DocumentMetadata => ({
  title: null,
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  created: null,
  modified: null,
  trapped: 'unknown',
  custom: {},
  ...over,
});

const tick = () => new Promise((r) => setTimeout(r));

describe('metadataReducer', () => {
  it('SET replaces the snapshot', () => {
    const m = META({ title: 'X' });
    expect(metadataReducer(initialMetadataState(), { type: 'SET', metadata: m }).metadata).toBe(m);
  });
});

describe('createMetadataCapability', () => {
  function makeCtx(metadata: DocumentMetadata | null = null) {
    let state = { metadata };
    const read = vi.fn(async () => META({ title: 'read' }));
    const update = vi.fn(async (patch: { title?: string | null }) => ({
      metadata: META({ title: patch.title ?? null }),
      cache: null,
    }));
    const ctx = {
      doc: { metadata: { read, update } },
      getState: () => state,
      dispatch: (a: { type: 'SET'; metadata: DocumentMetadata | null }) => {
        state = metadataReducer(state, a);
      },
    } as unknown as Parameters<typeof createMetadataCapability>[0];
    return { cap: createMetadataCapability(ctx), state: () => state, read, update };
  }

  it('current() reads state', () => {
    const m = META({ title: 'cur' });
    expect(makeCtx(m).cap.current()).toBe(m);
  });

  it('update() writes through the handle and sets state from the result', async () => {
    const h = makeCtx();
    await h.cap.update({ title: 'New' });
    expect(h.update).toHaveBeenCalledWith({ title: 'New' });
    expect(h.state().metadata?.title).toBe('New');
  });

  it('reload() re-reads from the engine', async () => {
    const h = makeCtx();
    await h.cap.reload();
    expect(h.read).toHaveBeenCalled();
    expect(h.state().metadata?.title).toBe('read');
  });

  it('rejects when no document is bound', async () => {
    const ctx = {
      doc: null,
      getState: () => ({ metadata: null }),
      dispatch: () => {},
    } as unknown as Parameters<typeof createMetadataCapability>[0];
    await expect(createMetadataCapability(ctx).update({ title: 'x' })).rejects.toThrow(
      /no document/,
    );
  });
});

describe('registerMetadataEffects — reactive state', () => {
  it('seeds from read, then updates live on metadata.updated (ignoring other events)', async () => {
    let state: { metadata: DocumentMetadata | null } = { metadata: null };
    const listeners = new Set<(e: unknown) => void>();
    const ctx = {
      doc: {
        metadata: { read: vi.fn(async () => META({ title: 'seed' })) },
        events: {
          subscribe: (fn: (e: unknown) => void) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
        },
      },
      dispatch: (a: { type: 'SET'; metadata: DocumentMetadata | null }) => {
        state = metadataReducer(state, a);
      },
      cleanup: () => {},
    } as unknown as Parameters<typeof registerMetadataEffects>[0];

    registerMetadataEffects(ctx);
    await tick(); // flush the seed read().then
    expect(state.metadata?.title).toBe('seed');

    // an own- or remote (SSE) metadata edit
    listeners.forEach((fn) =>
      fn({ type: 'metadata.updated', origin: {}, metadata: META({ title: 'live' }), cache: null }),
    );
    expect(state.metadata?.title).toBe('live');

    // an unrelated event leaves metadata untouched
    listeners.forEach((fn) => fn({ type: 'pages.rotated', layout: {} }));
    expect(state.metadata?.title).toBe('live');
  });
});
