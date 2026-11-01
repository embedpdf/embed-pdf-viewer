import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { toPageRef } from '../src/runtime';
import {
  attachmentPlugin,
  attachmentState,
  type AttachmentState,
  AttachmentToken,
  useAttachment,
  useAttachmentState,
} from '../src/attachment';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * The attachment composables against a real kernel: the declared state as
 * refs, empty with no document and loaded by being read, a selector, and the
 * API outside a document.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  tabOrder: null,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
};

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

const engine = {
  open: () =>
    Promise.resolve({
      id: 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, labels: [], pages: [page] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      attachments: { list: () => Promise.resolve({ attachments: files }) },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const latest = <Value>(values: Value[]) => values[values.length - 1];

enableAutoUnmount(afterEach);

describe('useAttachmentState', () => {
  it("has the page's State fields as refs: empty with no document, the document's once read", async () => {
    const states: unknown[] = [];
    const Probe = probe(() => {
      const { files, selected, status, canAdd, canDownload } = useAttachmentState();
      return () => {
        states.push({
          files: files.value,
          selected: selected.value,
          status: status.value,
          canAdd: canAdd.value,
          canDownload: canDownload.value,
        });
        return null;
      };
    });
    const { kernel } = await viewerWith([attachmentPlugin()], () => h(Probe), engine);
    expect(latest(states)).toEqual(attachmentState.empty);

    // Nothing reads the attachments as the document opens: the composable's reading them loads them.
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await vi.waitFor(() => expect(kernel.capability(AttachmentToken).getStatus()).toBe('ready'));
    await settle();
    const state = latest(states) as AttachmentState;
    expect(state.files.map((file) => file.name)).toEqual(['notes.txt', 'scan.pdf']);
    expect(state).toMatchObject({ status: 'ready', canAdd: true, canDownload: true });
  });

  it('with a selector, is one ref that follows the value it picks', async () => {
    const counts: number[] = [];
    const Probe = probe(() => {
      const count = useAttachmentState((state) => state.files.length);
      return () => {
        counts.push(count.value);
        return null;
      };
    });
    const { kernel } = await viewerWith([attachmentPlugin()], () => h(Probe), engine);
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await vi.waitFor(() => expect(kernel.capability(AttachmentToken).getStatus()).toBe('ready'));
    await settle();
    expect(latest(counts)).toBe(2);
    files = files.slice(0, 1);
    await kernel.capability(AttachmentToken).refresh();
    await settle();
    expect(latest(counts)).toBe(1);
  });
});

describe('useAttachment outside a document', () => {
  it('reads, and a verb called too early says no document is open', async () => {
    const found: { attachment?: ReturnType<typeof useAttachment> } = {};
    const Capture = probe(() => {
      found.attachment = useAttachment();
    });
    await viewerWith([attachmentPlugin()], () => h(Capture), engine);
    expect(() => found.attachment!.canAdd()).toThrow(
      expect.objectContaining({ code: 'not-ready' }),
    );
    await expect(found.attachment!.add([])).rejects.toMatchObject({ code: 'not-ready' });
  });
});
