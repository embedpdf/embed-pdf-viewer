import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import type { DocumentHandle, Engine, Kernel } from '@embedpdf/core';
import {
  useDocument,
  useDocuments,
  useDocumentsEvent,
  useDocumentsState,
  usePageList,
} from '../../src/runtime';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput, counterPlugin } from '../fixtures/counter-plugin';
import GateHarness from '../fixtures/GateHarness.svelte';
import Probes from '../fixtures/Probes.svelte';
import SettingsViewer from '../fixtures/SettingsViewer.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The documents in Svelte: `useDocuments()` is the API (its calls use the document in scope),
 * `useDocument()` and `useDocumentsState()` what to show, `<DocumentGate>` what to render for
 * each state, and `<Viewer>`'s own settings.
 */

const plugins = [counterPlugin];
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const probe = (read: () => unknown, pick: (result: never) => unknown, scope?: string) => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [] as unknown[],
  scope,
});

describe('useDocuments', () => {
  it('downloads the document in scope when download() has no id, and the active one outside a scope', async () => {
    const scoped = probe(
      () => useDocuments(),
      () => 0,
      'b',
    );
    const unscoped = probe(
      () => useDocuments(),
      () => 0,
    );
    let scopedDocuments: ReturnType<typeof useDocuments> | null = null;
    let activeDocuments: ReturnType<typeof useDocuments> | null = null;
    scoped.read = () => (scopedDocuments = useDocuments());
    unscoped.read = () => (activeDocuments = useDocuments());
    const { kernel } = await viewerWith(plugins, Probes, { probes: [scoped, unscoped] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');

    expect(decode(await scopedDocuments!.download())).toBe('b');
    expect(decode(await activeDocuments!.download())).toBe('a');
  });
});

describe('useDocument and useDocumentsState', () => {
  it('read the document in scope, every document, and an empty one without any', async () => {
    const document = probe(
      () => useDocument(),
      (info: object) => ({ ...info }),
    );
    const states = probe(
      () => useDocumentsState(),
      (state: object) => ({ ...state }),
    );
    const scopedId = probe(
      () => useDocument((info) => info.id),
      (id: CurrentValue<string>) => id.current,
      'a',
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [document, states, scopedId] });
    expect(latest(document.seen)).toMatchObject({
      id: '',
      status: 'loading',
      hasUnsavedChanges: false,
    });
    expect(latest(states.seen)).toEqual({ documents: [], activeId: null });

    await kernel.documents.open(bytesInput('a'), { name: 'Contract' });
    await kernel.documents.open(bytesInput('b'));
    flushSync();
    expect(latest(document.seen)).toMatchObject({ id: 'b', status: 'ready', pageCount: 1 });
    const last = latest(states.seen) as { activeId: string; documents: { name?: string }[] };
    expect(last.activeId).toBe('b');
    expect(last.documents.map((info) => info.name)).toEqual(['Contract', undefined]);
    expect(latest(scopedId.seen)).toBe('a');
  });
});

describe('useDocumentsEvent', () => {
  it('subscribes once, and stops when the component goes away', async () => {
    const opened = vi.fn();
    const events = probe(
      () => useDocumentsEvent((documents) => documents.onOpened, opened),
      () => 0,
    );
    const { kernel, view } = await viewerWith(plugins, Probes, { probes: [events] });
    await kernel.documents.open(bytesInput('a'));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0]![0]).toMatchObject({ documentId: 'a' });

    await view.rerender({ contentProps: { probes: [] } });
    flushSync();
    await kernel.documents.open(bytesInput('b'));
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

describe('usePageList', () => {
  it('lists the pages of the document in scope, with no Stage', async () => {
    const lists = probe(
      () => usePageList(),
      (pages: CurrentValue<readonly unknown[]>) => pages.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [lists] });
    expect(latest(lists.seen)).toEqual([]);
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(lists.seen)).toBe(kernel.documents.listPages('a'));
    expect(latest(lists.seen)).toHaveLength(1);
  });
});

describe('DocumentGate', () => {
  /** An engine whose `a` waits for its password, and whose `b` fails. */
  const engine = {
    open: (input: { id: string }) =>
      input.id === 'b'
        ? Promise.reject(new Error('corrupt file'))
        : Promise.resolve({
            id: input.id,
            events: { subscribe: () => () => {}, lastServerId: () => null },
            security: {
              allows: () => true,
              passwordPrompt: { state: 'required', incorrect: true },
            },
            // Calls' facts and working sets change nothing here: the same document.
            with() {
              return this;
            },
            setWorkingSet: () => {},
            close: () => Promise.resolve(),
          } as unknown as DocumentHandle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;

  it('renders `locked` and `error` with the document, and `fallback` otherwise', async () => {
    const { kernel, view } = await viewerWith(plugins, GateHarness, {}, engine);
    const text = () => view.getByTestId('mounted').textContent;
    expect(text()).toBe('opening');
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(text()).toBe('locked true');
    await kernel.documents.open(bytesInput('b')).catch(() => {});
    flushSync();
    expect(text()).toBe('failed: corrupt file');
  });
});

describe('the Viewer’s own settings', () => {
  it('follow the props, and a prop left out is its default', async () => {
    let kernel: Kernel | null = null;
    const accents: unknown[] = [];
    const engine = {
      open: vi.fn((input: { id: string }, _options?: object) =>
        Promise.resolve({
          id: input.id,
          events: { subscribe: () => () => {}, lastServerId: () => null },
          pages: { list: () => Promise.resolve({ pageCount: 0, pages: [] }) },
          security: { allows: () => true },
          // Calls' facts and working sets change nothing here: the same document.
          with() {
            return this;
          },
          setWorkingSet: () => {},
          close: () => Promise.resolve(),
        } as unknown as DocumentHandle),
      ),
      destroy: () => Promise.resolve(),
    };
    const view = render(SettingsViewer, {
      props: {
        engine: engine as unknown as Engine,
        plugins,
        accent: '#e91e63',
        scope: ['doc.open'],
        accents,
        onReady: (ready: Kernel) => (kernel = ready),
      },
    });
    await waitFor(() => view.getByTestId('probe'));
    await waitFor(() => expect(engine.open).toHaveBeenCalled());
    // The initial documents open with the first props.
    expect(engine.open.mock.calls[0]![1]).toEqual({
      scope: ['doc.open'],
      identity: { userId: 'u1' },
    });
    flushSync();
    expect(latest(accents)).toBe('#e91e63');
    expect(kernel!.getSettings().page).toEqual({ background: '#ffffff', shadow: 'none' });

    await view.rerender({ accent: undefined, scope: undefined });
    await waitFor(() => expect(latest(accents)).toBe('#3858e9'));
    expect(kernel!.getSettings().scope).toBeNull();
  });
});
