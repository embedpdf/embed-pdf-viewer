import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import {
  AttachmentToken,
  attachmentPlugin,
  attachmentState,
  useAttachment,
  useAttachmentState,
} from '../../src/attachment';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput, testPage } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The attachment readers against a real kernel: the declared state as a reactive object (empty
 * without a document, loaded by being read), a selector, and the API before a document opens.
 */

const attached = (key: string, index: number, mimeType: string) => ({
  ref: { kind: 'key', key },
  index,
  name: key,
  mimeType,
  description: null,
  size: 4,
  checksum: null,
  createdAt: null,
  modifiedAt: null,
});

/** What the document holds; a test changes it, then reads again. */
let files = [attached('notes.txt', 0, 'text/plain'), attached('scan.pdf', 1, 'application/pdf')];

const attachmentEngine = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      id: input.id ?? 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [testPage] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      attachments: { list: () => Promise.resolve({ attachments: files }) },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const plugins = [attachmentPlugin()];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useAttachmentState', () => {
  it("has the page's State fields: empty with no document, the document's once read", async () => {
    const state = probe(
      () => useAttachmentState(),
      (record) => ({ ...record }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] }, attachmentEngine);
    expect(latest(state.seen)).toEqual(attachmentState.empty);

    // Nothing reads the attachments as the document opens: the reader's reading them loads them.
    await kernel.documents.open(bytesInput('doc'));
    await vi.waitFor(() => expect(kernel.capability(AttachmentToken).getStatus()).toBe('ready'));
    flushSync();
    const seen = latest(state.seen) as ReturnType<typeof attachmentState.read>;
    expect(seen.files.map((file) => file.name)).toEqual(['notes.txt', 'scan.pdf']);
    expect(seen).toMatchObject({ status: 'ready', canAdd: true, canDownload: true });
  });

  it('with a selector, gives { current } that follows the value it picks', async () => {
    const counts = probe(
      () => useAttachmentState((state) => state.files.length),
      (count: CurrentValue<number>) => count.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [counts] }, attachmentEngine);
    await kernel.documents.open(bytesInput('doc'));
    await vi.waitFor(() => expect(kernel.capability(AttachmentToken).getStatus()).toBe('ready'));
    flushSync();
    expect(latest(counts.seen)).toBe(2);
    files = files.slice(0, 1);
    await kernel.capability(AttachmentToken).refresh();
    flushSync();
    expect(latest(counts.seen)).toBe(1);
  });
});

describe('useAttachment before a document opens', () => {
  it('a verb called too early says no document is open', async () => {
    const found: { attachment?: ReturnType<typeof useAttachment> } = {};
    const capture = probe(
      () => (found.attachment = useAttachment()),
      () => null,
    );
    await viewerWith(plugins, Probes, { probes: [capture] }, attachmentEngine);
    expect(() => found.attachment!.canAdd()).toThrow(
      expect.objectContaining({ code: 'not-ready' }),
    );
    await expect(found.attachment!.add([])).rejects.toMatchObject({ code: 'not-ready' });
  });
});
