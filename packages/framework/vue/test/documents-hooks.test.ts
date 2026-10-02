import { h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
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
  useActionsEvent,
  useActionsSettings,
  useActionsUiAdapter,
} from '../src/actions';
import type { ActionContext, ActionsUiHandlers, PdfActionTree } from '../src/actions';
import {
  useViewManager,
  useViewManagerEvent,
  useViewManagerState,
  viewManagerPlugin,
} from '../src/view-manager';
import type { PaneInfo } from '../src/view-manager';
import { bytesInput, probe, settle, viewerWith } from './counter-plugin';

/**
 * The page edit, metadata, actions and view manager composables against a
 * real kernel: the API with and without a document, the declared state as
 * refs, the actions settings before any document opens, and the actions UI
 * adapter's install, late-read handlers and removal.
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
  open: (input: { id?: string }) =>
    Promise.resolve({
      id: input.id ?? 'doc',
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

const latest = <Value>(values: Value[]) => values[values.length - 1];

enableAutoUnmount(afterEach);

describe('useMetadataState', () => {
  it("has exactly the page's State fields as refs: empty with no document, the document's once it loads", async () => {
    const states: unknown[] = [];
    const Probe = probe(() => {
      const { metadata, custom, status } = useMetadataState();
      return () => {
        states.push({ metadata: metadata.value, custom: custom.value, status: status.value });
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe), engine);
    expect(latest(states)).toEqual(metadataState.empty);

    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await kernel.capability(MetadataToken).refresh();
    await settle();
    expect(latest(states)).toEqual({
      metadata: METADATA,
      custom: { contractId: 'C-2026-114' },
      status: 'ready',
    });
  });

  it('with a selector, is one ref that changes only when the value it picks does', async () => {
    const titles: (string | null)[] = [];
    const Probe = probe(() => {
      const title = useMetadataState((state) => state.metadata?.title ?? null);
      return () => {
        titles.push(title.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe), engine);
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await kernel.capability(MetadataToken).refresh();
    await settle();
    expect(latest(titles)).toBe('Q2 Proposal');
    const renders = titles.length;

    // Another plugin's change wakes every reader; the title it picks is the same, so nothing renders.
    kernel.settingsOf(ActionsToken).updateSettings({ policy: { uri: { hover: 'block' } } });
    await settle();
    expect(titles).toHaveLength(renders);
  });
});

describe('use<Plugin>() outside a document', () => {
  it('reads, and a verb called too early says no document is open', async () => {
    const found: {
      metadata?: ReturnType<typeof useMetadata>;
      pageEdit?: ReturnType<typeof usePageEdit>;
      actions?: ReturnType<typeof useActions>;
    } = {};
    const Capture = probe(() => {
      found.metadata = useMetadata();
      found.pageEdit = usePageEdit();
      found.actions = useActions();
    });
    await viewerWith(plugins, () => h(Capture), engine);
    const { metadata, pageEdit, actions } = found;
    expect(() => metadata!.canUpdate()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    // A verb that returns a promise rejects, so `.catch()` sees the refusal.
    await expect(metadata!.custom.update({})).rejects.toMatchObject({ code: 'not-ready' });
    expect(() => pageEdit!.canEdit()).toThrow(expect.objectContaining({ code: 'not-ready' }));
    // The settings belong to the plugin, so they work without a document.
    expect(actions!.getSettings()).toEqual({ ...ACTIONS_DEFAULTS, openSequence: 'off' });
  });

  it('is one object that reaches the document once it opens', async () => {
    let pageEdit: ReturnType<typeof usePageEdit> | null = null;
    const Capture = probe(() => {
      pageEdit = usePageEdit();
    });
    const { kernel } = await viewerWith(plugins, () => h(Capture), engine);
    const first = pageEdit;
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await settle();
    expect(pageEdit).toBe(first);
    expect(pageEdit!.canEdit()).toBe(true);
  });
});

describe('useActionsSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const settings: unknown[] = [];
    const Probe = probe(() => {
      const { policy, openSequence } = useActionsSettings();
      return () => {
        settings.push({ policy: policy.value, openSequence: openSequence.value });
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe), engine);
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(settings)).toEqual({ policy: ACTIONS_DEFAULTS.policy, openSequence: 'off' });

    kernel.settingsOf(ActionsToken).updateSettings({ policy: { uri: { hover: 'block' } } });
    await settle();
    expect(latest(settings)).toMatchObject({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'report' } },
    });
  });

  it('with a selector, is one ref for the value it picks', async () => {
    const policies: unknown[] = [];
    const Probe = probe(() => {
      const uri = useActionsSettings((settings) => settings.policy.uri);
      return () => {
        policies.push(uri.value);
        return null;
      };
    });
    await viewerWith(plugins, () => h(Probe), engine);
    expect(latest(policies)).toEqual(ACTIONS_DEFAULTS.policy.uri);
  });
});

describe('useActionsUiAdapter', () => {
  /** A link to a website, clicked: the default rules hand it to the adapter. */
  const websiteLink: PdfActionTree = {
    root: { type: 'uri', subtype: 'URI', uri: 'https://example.com', isMap: false, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  };
  const click: ActionContext = {
    origin: 'user',
    source: { kind: 'api' },
    event: { scope: 'activate' },
  };

  it('installs the adapter for the document, reads the handlers late, and removes it on unmount', async () => {
    const opened: string[] = [];
    const diagnostics: string[] = [];
    const handlers = ref<ActionsUiHandlers>({ openUri: (uri) => opened.push(`first ${uri}`) });
    const shown = ref(true);
    const Adapter = probe(() => {
      useActionsUiAdapter(handlers);
    });
    const Diagnostics = probe(() => {
      useActionsEvent(
        (actions) => actions.onDiagnosticReported,
        ({ code }) => diagnostics.push(code),
      );
    });
    const { kernel } = await viewerWith(
      plugins,
      () => [shown.value ? h(Adapter) : null, h(Diagnostics)],
      engine,
    );
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await settle();
    const actions = kernel.capability(ActionsToken);

    await actions.execute(websiteLink, click);
    expect(opened).toEqual(['first https://example.com']);

    // New handlers take effect at once, without installing the adapter again.
    const install = vi.spyOn(actions, 'setUiAdapter');
    handlers.value = { openUri: (uri) => opened.push(`second ${uri}`) };
    await settle();
    await actions.execute(websiteLink, click);
    expect(opened).toEqual(['first https://example.com', 'second https://example.com']);
    expect(install).not.toHaveBeenCalled();
    install.mockRestore();

    // Unmounted, the adapter is gone: the link is reported instead of opened.
    shown.value = false;
    await settle();
    await actions.execute(websiteLink, click);
    expect(opened).toHaveLength(2);
    expect(diagnostics).toContain('no-adapter');
  });
});

describe('useViewManagerState and useViewManagerEvent', () => {
  const withPanes = [...plugins, viewManagerPlugin()];

  it('reads the panes as refs, and follows a split', async () => {
    const panes: (readonly PaneInfo[])[] = [];
    const focused: (string | null)[] = [];
    let views: ReturnType<typeof useViewManager> | null = null;
    const Probe = probe(() => {
      views = useViewManager();
      const state = useViewManagerState();
      return () => {
        panes.push(state.panes.value);
        focused.push(state.focusedPaneId.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(withPanes, () => h(Probe), engine);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    await settle();
    expect(latest(panes)).toHaveLength(1);
    expect(latest(panes)[0].documentIds).toEqual(['a', 'b']);

    const paneId = views!.splitPane('b');
    await settle();
    expect(latest(panes).map((pane) => pane.documentIds)).toEqual([['a'], ['b']]);
    expect(latest(focused)).toBe(paneId);
  });

  it('subscribes once, and stops when the component unmounts', async () => {
    const created = vi.fn();
    const shown = ref(true);
    let views: ReturnType<typeof useViewManager> | null = null;
    const Probe = probe(() => {
      useViewManagerEvent((viewManager) => viewManager.onPaneCreated, created);
    });
    const Views = probe(() => {
      views = useViewManager();
    });
    const { kernel } = await viewerWith(
      withPanes,
      () => [shown.value ? h(Probe) : null, h(Views)],
      engine,
    );
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    await settle();
    // The first document opened into a new pane; the split adds one more.
    created.mockClear();
    const paneId = views!.splitPane('b');
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0]).toEqual({ paneId });

    shown.value = false;
    await nextTick();
    views!.splitPane('a');
    expect(created).toHaveBeenCalledTimes(1);
  });
});
