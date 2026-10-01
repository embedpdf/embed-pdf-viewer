// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { DocumentHandle, DocumentInfo, Engine, Kernel } from '@embedpdf/core';
import {
  DocumentGate,
  DocumentScope,
  Viewer,
  useDocument,
  useDocuments,
  useDocumentsEvent,
  useDocumentsState,
  usePageList,
  useViewerSettings,
} from '../src/runtime';
import { bytesInput, counterPlugin, viewerWith } from './counter-plugin';

/**
 * The documents in React: `useDocuments()` is the API (its calls use the
 * document in scope), `useDocument()` and `useDocumentsState()` what to show,
 * `<DocumentGate>` what to render for each state, and `<Viewer>`'s own settings.
 */

type Download = ReturnType<typeof useDocuments>['download'];

function DownloadProbe({ downloads }: { downloads: Download[] }) {
  downloads.push(useDocuments().download);
  return null;
}

const latest = <T,>(values: T[]) => values[values.length - 1];
const plugins = [counterPlugin];

afterEach(cleanup);

describe('useDocuments', () => {
  it('downloads the document in scope when download() has no id, and the active one outside a scope', async () => {
    const scoped: Download[] = [];
    const unscoped: Download[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <DocumentScope id="b">
          <DownloadProbe downloads={scoped} />
        </DocumentScope>
        <DownloadProbe downloads={unscoped} />
      </>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    await act(() => kernel.documents.open(bytesInput('b')));
    act(() => kernel.documents.setActive('a'));

    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(decode(await latest(scoped)())).toBe('b');
    expect(decode(await latest(unscoped)())).toBe('a');
  });

  it('is the same object on every render', async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useDocuments());
      return null;
    }
    const { kernel } = await viewerWith(plugins, <Probe />);
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(new Set(seen).size).toBe(1);
  });
});

describe('useDocument and useDocumentsState', () => {
  it('read the document in scope, every document, and an empty one without any', async () => {
    const documents: DocumentInfo[] = [];
    const states: { documents: readonly DocumentInfo[]; activeId: string | null }[] = [];
    function Probe() {
      documents.push(useDocument());
      states.push(useDocumentsState());
      return null;
    }
    function Scoped() {
      return <span data-testid="scoped">{useDocument((document) => document.id)}</span>;
    }
    const { kernel } = await viewerWith(
      plugins,
      <>
        <Probe />
        <DocumentScope id="a">
          <Scoped />
        </DocumentScope>
      </>,
    );
    expect(latest(documents)).toMatchObject({
      id: '',
      status: 'loading',
      hasUnsavedChanges: false,
    });
    expect(latest(states)).toEqual({ documents: [], activeId: null });

    await act(() => kernel.documents.open(bytesInput('a'), { name: 'Contract' }));
    await act(() => kernel.documents.open(bytesInput('b')));
    expect(latest(documents)).toMatchObject({ id: 'b', status: 'ready', pageCount: 1 });
    expect(latest(states).activeId).toBe('b');
    expect(latest(states).documents.map((document) => document.name)).toEqual([
      'Contract',
      undefined,
    ]);
    expect(document.querySelector('[data-testid="scoped"]')?.textContent).toBe('a');
  });
});

describe('useDocumentsEvent', () => {
  it('subscribes once, even with an inline selector', async () => {
    const opened = vi.fn();
    function Probe() {
      useDocumentsEvent((documents) => documents.onOpened, opened);
      return null;
    }
    const { kernel, rerender } = await viewerWith(plugins, <Probe />);
    rerender(<Probe />);
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0]).toMatchObject({ documentId: 'a' });
  });
});

describe('usePageList', () => {
  it('lists the pages of the document in scope, with no Stage', async () => {
    const lists: (readonly unknown[])[] = [];
    function Probe() {
      lists.push(usePageList());
      return null;
    }
    const { kernel } = await viewerWith(plugins, <Probe />);
    expect(latest(lists)).toEqual([]);
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(latest(lists)).toBe(kernel.documents.listPages('a'));
    expect(latest(lists)).toHaveLength(1);
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
            close: () => Promise.resolve(),
          } as unknown as DocumentHandle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;

  it('renders `locked` and `error` with the document, and `fallback` otherwise', async () => {
    const gate = (
      <DocumentGate
        fallback={<p>opening</p>}
        locked={(document) => <p>locked {String(document.passwordProvided)}</p>}
        error={(document) => <p>failed: {document.error.message}</p>}
      >
        <p>ready</p>
      </DocumentGate>
    );
    const { kernel } = await viewerWith(plugins, gate, engine);
    const text = () => document.querySelector('[data-testid="mounted"]')?.textContent;
    expect(text()).toBe('opening');
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(text()).toBe('locked true');
    await act(() => kernel.documents.open(bytesInput('b')).catch(() => {}));
    expect(text()).toBe('failed: corrupt file');
  });
});

describe('the Viewer’s own settings', () => {
  it('follow the props, and a prop left out is its default', async () => {
    let kernel: Kernel | null = null;
    const accents: string[] = [];
    function Probe() {
      accents.push(useViewerSettings((settings) => settings.accent));
      return <span data-testid="probe" />;
    }
    const engine = {
      open: vi.fn((input: { id: string }, _options?: object) =>
        Promise.resolve({
          id: input.id,
          events: { subscribe: () => () => {}, lastServerId: () => null },
          pages: { list: () => Promise.resolve({ pageCount: 0, pages: [] }) },
          security: { allows: () => true },
          close: () => Promise.resolve(),
        } as unknown as DocumentHandle),
      ),
      destroy: () => Promise.resolve(),
    };
    const viewer = (props: { accent?: string; scope?: string[] }) => (
      <Viewer
        engine={engine as unknown as Engine}
        plugins={plugins}
        identity={{ userId: 'u1' }}
        page={{ shadow: 'none' }}
        onReady={(ready) => (kernel = ready)}
        initialDocuments={[{ source: bytesInput('a') }]}
        {...props}
      >
        <Probe />
      </Viewer>
    );
    const { rerender, getByTestId } = render(viewer({ accent: '#e91e63', scope: ['doc.open'] }));
    await waitFor(() => getByTestId('probe'));
    await waitFor(() => expect(engine.open).toHaveBeenCalled());
    // The initial documents open with the first props.
    expect(engine.open.mock.calls[0][1]).toEqual({
      scope: ['doc.open'],
      identity: { userId: 'u1' },
    });
    expect(latest(accents)).toBe('#e91e63');
    expect(kernel!.getSettings().page).toEqual({
      background: '#ffffff',
      shadow: 'none',
    });

    rerender(viewer({}));
    await waitFor(() => expect(latest(accents)).toBe('#3858e9'));
    expect(kernel!.getSettings().scope).toBeNull();
  });
});
