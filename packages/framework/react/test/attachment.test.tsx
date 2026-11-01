// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
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
import { viewerWith } from './counter-plugin';

/**
 * The attachment hooks against a real kernel: the declared state, empty with
 * no document and loaded by being read, a selector, and the capability
 * outside a document.
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

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

afterEach(cleanup);

describe('useAttachmentState', () => {
  it("has the page's State fields: empty with no document, the document's once read", async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      [attachmentPlugin()],
      <Probe read={() => useAttachmentState()} renders={renders} />,
      engine,
    );
    expect(latest(renders)).toBe(attachmentState.empty);

    // Nothing reads the attachments as the document opens: the hook's reading them loads them.
    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    await waitFor(() => expect(kernel.capability(AttachmentToken).getStatus()).toBe('ready'));
    const state = latest(renders) as AttachmentState;
    expect(state.files.map((file) => [file.id, file.name])).toEqual([
      ['doc:notes.txt', 'notes.txt'],
      ['doc:scan.pdf', 'scan.pdf'],
    ]);
    expect(state).toMatchObject({ status: 'ready', canAdd: true, canDownload: true });
  });

  it('picks one value with a selector', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      [attachmentPlugin()],
      <Probe read={() => useAttachmentState((state) => state.files.length)} renders={renders} />,
      engine,
    );
    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    await waitFor(() => expect(latest(renders)).toBe(2));
    files = files.slice(0, 1);
    await act(() => kernel.capability(AttachmentToken).refresh());
    expect(latest(renders)).toBe(1);
  });
});

describe('useAttachment outside a document', () => {
  it('renders, and a verb called too early says no document is open', async () => {
    const captured: { attachment?: ReturnType<typeof useAttachment> } = {};
    function Capture() {
      captured.attachment = useAttachment();
      return null;
    }
    await viewerWith([attachmentPlugin()], <Capture />, engine);
    const attachment = captured.attachment!;
    expect(() => attachment.canAdd()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    await expect(attachment.add([])).rejects.toMatchObject({ code: 'not-ready' });
  });
});
