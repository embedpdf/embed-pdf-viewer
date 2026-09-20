import { describe, expect, it } from 'vitest';
import { registerMetadataEffects } from '../src/effects';
import { initialMetadataState, metadataReducer } from '../src/reducer';
import type { DocumentMetadata } from '@embedpdf/core';

/**
 * G6 (known defect, fixed by the metadata pilot in Phase 2): a slow seed read
 * that resolves AFTER a `metadata.updated` event must not overwrite the newer
 * value. Marked `fails` so the suite documents the defect and flips red the
 * moment it is fixed, forcing this test to become a plain `it`.
 */
const META = (title: string | null): DocumentMetadata => ({
  title,
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  created: null,
  modified: null,
  trapped: 'unknown',
  custom: {},
});

describe('metadata seed race (G6)', () => {
  it.fails('a seed read resolving after a newer event does not overwrite it', async () => {
    let state = initialMetadataState();
    let resolveSeed!: (m: DocumentMetadata) => void;
    let listener: ((e: unknown) => void) | null = null;
    const ctx = {
      doc: {
        metadata: { read: () => new Promise<DocumentMetadata>((r) => (resolveSeed = r)) },
        events: { subscribe: (l: (e: unknown) => void) => ((listener = l), () => {}) },
      },
      getState: () => state,
      dispatch: (a: { type: 'SET'; metadata: DocumentMetadata }) => {
        state = metadataReducer(state, a);
      },
      cleanup: () => {},
    } as unknown as Parameters<typeof registerMetadataEffects>[0];

    registerMetadataEffects(ctx);
    listener!({ type: 'metadata.updated', metadata: META('newer'), origin: { kind: 'remote' } });
    resolveSeed(META('stale'));
    await new Promise((r) => setTimeout(r));
    expect(state.metadata?.title).toBe('newer');
  });
});
