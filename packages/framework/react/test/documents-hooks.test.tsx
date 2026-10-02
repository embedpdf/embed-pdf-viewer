// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import type { DocumentHandle, DocumentMetadata, Engine, PageLayout } from '@embedpdf/core';
import { toPageRef } from '../src/runtime';
import {
  metadataPlugin,
  metadataState,
  MetadataToken,
  useMetadata,
  useMetadataState,
} from '../src/metadata';
import { pageEditPlugin, usePageEdit } from '../src/page-edit';
import {
  ACTIONS_DEFAULTS,
  actionsPlugin,
  ActionsToken,
  useActions,
  useActionsSettings,
} from '../src/actions';
import { viewerWith } from './counter-plugin';

/**
 * The page edit, metadata and actions hooks against a real kernel: the
 * capability with and without a document, the metadata's declared state, and
 * the actions settings before any document opens.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const page: PageLayout = {
  index: 0,
  ref: toPageRef(1),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
};

const METADATA: DocumentMetadata = {
  title: 'Q2 Proposal',
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  createdAt: null,
  modifiedAt: null,
  trapped: 'unknown',
};

const engine = {
  open: () =>
    Promise.resolve({
      id: 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      metadata: {
        get: () => Promise.resolve(METADATA),
        custom: { get: () => Promise.resolve({ contractId: 'C-2026-114' }) },
      },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const plugins = [pageEditPlugin(), metadataPlugin(), actionsPlugin({ openSequence: 'off' })];

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

afterEach(cleanup);

describe('useMetadataState', () => {
  it("has exactly the page's State fields: empty with no document, the document's once it loads", async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <Probe read={() => useMetadataState()} renders={renders} />,
      engine,
    );
    expect(latest(renders)).toBe(metadataState.empty);

    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    await act(() => kernel.capability(MetadataToken).refresh());
    expect(latest(renders)).toEqual({
      metadata: METADATA,
      custom: { contractId: 'C-2026-114' },
      status: 'ready',
    });
  });
});

describe('use<Plugin>() outside a document', () => {
  it('renders, and a verb called too early says no document is open', async () => {
    const captured: { metadata?: unknown; pageEdit?: unknown; actions?: unknown } = {};
    function Capture() {
      captured.metadata = useMetadata();
      captured.pageEdit = usePageEdit();
      captured.actions = useActions();
      return null;
    }
    await viewerWith(plugins, <Capture />, engine);
    const metadata = captured.metadata as ReturnType<typeof useMetadata>;
    const pageEdit = captured.pageEdit as ReturnType<typeof usePageEdit>;
    const actions = captured.actions as ReturnType<typeof useActions>;
    expect(() => metadata.canUpdate()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    // A verb that returns a promise rejects, so `.catch()` sees the refusal.
    await expect(metadata.custom.update({})).rejects.toMatchObject({ code: 'not-ready' });
    expect(() => pageEdit.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    // The settings belong to the plugin, so they work without a document.
    expect(actions.getSettings()).toEqual({ ...ACTIONS_DEFAULTS, openSequence: 'off' });
  });
});

describe('useActionsSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <Probe read={() => useActionsSettings()} renders={renders} />,
      engine,
    );
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(renders)).toEqual({ ...ACTIONS_DEFAULTS, openSequence: 'off' });

    act(() =>
      kernel.settingsOf(ActionsToken).updateSettings({ policy: { uri: { hover: 'block' } } }),
    );
    expect(latest(renders)).toMatchObject({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'report' } },
    });

    const policies: unknown[] = [];
    await viewerWith(
      plugins,
      <Probe
        read={() => useActionsSettings((settings) => settings.policy.uri)}
        renders={policies}
      />,
      engine,
    );
    expect(latest(policies)).toEqual(ACTIONS_DEFAULTS.policy.uri);
  });
});
