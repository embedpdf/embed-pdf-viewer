// @vitest-environment happy-dom
import * as React from 'react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf-x/kernel';
import { Viewer, useKernel, DocumentGate } from '../src/runtime';
import type { AnyPlugin, PluginContext } from '@embedpdf-x/kernel';

/**
 * The Viewer's lifecycle contract, exercised through real React render
 * cycles:
 *   - StrictMode's setup/cleanup/setup creates two kernels and fully
 *     destroys the first — documents open once, nothing leaks.
 *   - The kernel is on context DURING boot, so the fallback can use
 *     workspace capabilities (the i18n promise).
 *   - A failed boot renders `renderError` — never a silent forever-fallback.
 *   - engine/plugins are init-only: changed identities warn and are ignored.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
const page = (pon: number, index: number): PageLayout => ({
  index,
  pageObjectNumber: pon,
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: { ...box }, crop: { ...box } },
});

function makeHandle(id: string) {
  const handle = {
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page(1, 0)] }) },
    close: vi.fn(() => Promise.resolve()),
  };
  return { handle: handle as unknown as DocumentHandle, close: handle.close };
}

function countingEngine() {
  const handles: ReturnType<typeof makeHandle>[] = [];
  const open = vi.fn((input: { id?: string }) => {
    const made = makeHandle(input.id ?? '?');
    handles.push(made);
    return Promise.resolve(made.handle);
  });
  return { engine: { open, destroy: () => Promise.resolve() } as unknown as Engine, open, handles };
}

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });

afterEach(cleanup);

describe('<Viewer> lifecycle', () => {
  it('StrictMode: two kernels, first fully destroyed, documents open exactly once', async () => {
    const { engine, open, handles } = countingEngine();
    const constructed = vi.fn();
    const torndown = vi.fn();
    const plugin: AnyPlugin = {
      id: 'ws-probe',
      token: { name: 'ws-probe' },
      capability: (ctx: PluginContext<unknown>) => {
        constructed();
        ctx.cleanup(torndown);
        return {};
      },
    };
    const plugins = [plugin];
    const initialDocuments = [{ source: bytesInput('a') }];

    const view = render(
      <StrictMode>
        <Viewer engine={engine} plugins={plugins} initialDocuments={initialDocuments}>
          <DocumentGate>
            <div data-testid="doc-ui">document ready</div>
          </DocumentGate>
        </Viewer>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('doc-ui')).toBeTruthy());
    // Both StrictMode setups built a kernel (workspace capability constructed
    // eagerly), and the first was fully destroyed.
    expect(constructed).toHaveBeenCalledTimes(2);
    expect(torndown).toHaveBeenCalledTimes(1);
    // Only the surviving kernel opened the initial documents.
    expect(open).toHaveBeenCalledTimes(1);
    expect(handles[0].close).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(torndown).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(handles[0].close).toHaveBeenCalledTimes(1)); // the leak fix
  });

  it('the fallback renders WITH the kernel on context during boot', async () => {
    const { engine } = countingEngine();
    let releaseInit!: () => void;
    const initGate = new Promise<void>((r) => (releaseInit = r));
    const slowPlugin: AnyPlugin = { id: 'slow-ws', init: () => initGate };

    function BootScreen() {
      const kernel = useKernel(); // the i18n contract: usable before start() resolves
      return <div data-testid="boot">{`booting (${kernel.status()})`}</div>;
    }

    render(
      <Viewer engine={engine} plugins={[slowPlugin]} fallback={<BootScreen />}>
        <div data-testid="shell">shell</div>
      </Viewer>,
    );

    await waitFor(() => expect(screen.getByTestId('boot').textContent).toContain('starting'));
    releaseInit();
    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
  });

  it('a failed boot renders renderError, never a silent forever-fallback', async () => {
    const { engine } = countingEngine();
    const broken: AnyPlugin = {
      id: 'broken-ws',
      init: () => Promise.reject(new Error('locale pack exploded')),
    };

    render(
      <Viewer
        engine={engine}
        plugins={[broken]}
        fallback={<div data-testid="fallback">loading…</div>}
        renderError={(error) => <div data-testid="boot-error">{String(error)}</div>}
      >
        <div>shell</div>
      </Viewer>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('boot-error').textContent).toContain('locale pack exploded'),
    );
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('engine/plugins are init-only: a changed identity warns and is ignored', async () => {
    const { engine, open } = countingEngine();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(
      <Viewer engine={engine} plugins={[]} initialDocuments={[{ source: bytesInput('a') }]}>
        <div data-testid="shell">shell</div>
      </Viewer>,
    );
    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
    expect(open).toHaveBeenCalledTimes(1);

    // Re-render with a NEW plugins array identity (the classic inline-array mistake).
    view.rerender(
      <Viewer engine={engine} plugins={[]} initialDocuments={[{ source: bytesInput('a') }]}>
        <div data-testid="shell">shell</div>
      </Viewer>,
    );
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('init-only')));
    expect(open).toHaveBeenCalledTimes(1); // no kernel rebuild, no re-open
    expect(screen.getByTestId('shell')).toBeTruthy(); // viewer unharmed
    warn.mockRestore();
  });
});
