import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { pageEditPlugin, usePageEdit } from '../../src/page-edit';
import { bytesInput } from '../fixtures/counter-plugin';
import { metadataEngine } from '../fixtures/metadata-engine';
import Probes from '../fixtures/Probes.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `usePageEdit()` against a real kernel: a handle that refuses without a document, reaches the
 * document once it's open, and whose `can*` reads follow the kernel in a reaction.
 */

const plugins = [pageEditPlugin()];

describe('usePageEdit', () => {
  it('without a document, a call says no document is open; with one, the same handle reaches it', async () => {
    let pageEdit: ReturnType<typeof usePageEdit> | null = null;
    const capture = { read: () => (pageEdit = usePageEdit()), pick: () => 0, seen: [] };
    const { kernel } = await viewerWith(plugins, Probes, { probes: [capture] }, metadataEngine);
    const first = pageEdit;
    expect(() => pageEdit!.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));

    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    expect(pageEdit).toBe(first);
    expect(pageEdit!.canEdit()).toBe(true);
  });

  it('reads canEdit() in a reaction, which runs again once a document is ready', async () => {
    const canEdit = {
      read: () => usePageEdit(),
      pick: (pageEdit: unknown) => {
        try {
          return (pageEdit as ReturnType<typeof usePageEdit>).canEdit();
        } catch {
          return 'not-ready';
        }
      },
      seen: [] as unknown[],
    };
    const { kernel } = await viewerWith(plugins, Probes, { probes: [canEdit] }, metadataEngine);
    expect(latest(canEdit.seen)).toBe('not-ready');

    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    expect(latest(canEdit.seen)).toBe(true);
  });
});
