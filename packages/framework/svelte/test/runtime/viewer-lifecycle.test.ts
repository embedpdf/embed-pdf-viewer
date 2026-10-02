import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { LOCAL_ENGINE_BRAND } from '@embedpdf/core/testing';
import type { AnyPlugin, DocumentHandle, Engine, PageLayout, PluginContext } from '@embedpdf/core';
import BootHarness from '../fixtures/BootHarness.svelte';
import { testPage } from '../fixtures/counter-plugin';

/**
 * The Viewer's lifecycle: one kernel per mount, destroyed with every document handle on unmount;
 * the fallback renders with the kernel in context before the content; a failed start renders
 * `error`, never a fallback forever; `engine` and `plugins` are read once; and engine ownership
 * follows the shape of `engine`.
 */

const page: PageLayout = testPage;

function makeHandle(id: string) {
  const handle = {
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    close: vi.fn(() => Promise.resolve()),
  };
  return { handle: handle as unknown as DocumentHandle, close: handle.close };
}

/** A fake engine; `local: false` leaves off the local brand, as a cloud engine does. */
function countingEngine({ local = true }: { local?: boolean } = {}) {
  const handles: ReturnType<typeof makeHandle>[] = [];
  const open = vi.fn((input: { id?: string }) => {
    const made = makeHandle(input.id ?? '?');
    handles.push(made);
    return Promise.resolve(made.handle);
  });
  const destroy = vi.fn(() => Promise.resolve());
  const warmup = vi.fn();
  return {
    engine: { [LOCAL_ENGINE_BRAND]: local, open, destroy, warmup } as unknown as Engine,
    open,
    destroy,
    warmup,
    handles,
  };
}

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });

describe('<Viewer> lifecycle', () => {
  it('opens the initial documents once, and destroys the kernel and its handles on unmount', async () => {
    const { engine, open, handles } = countingEngine();
    const constructed = vi.fn();
    const torndown = vi.fn();
    const plugin: AnyPlugin = {
      id: 'ws-probe',
      token: { name: 'ws-probe' },
      create: (ctx: PluginContext<unknown>) => {
        constructed();
        ctx.cleanup(torndown);
        return { api: {} };
      },
    };
    const view = render(BootHarness, {
      props: { engine, plugins: [plugin], initialDocuments: [{ source: bytesInput('a') }] },
    });

    await waitFor(() => expect(screen.getByTestId('doc-ui')).toBeTruthy());
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(handles[0]!.close).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(torndown).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(handles[0]!.close).toHaveBeenCalledTimes(1));
  });

  it('renders the fallback with the kernel in context before the content', async () => {
    const { engine } = countingEngine();
    const statuses: string[] = [];
    render(BootHarness, { props: { engine, plugins: [], statuses } });

    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
    expect(statuses.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('boot')).toBeNull();
  });

  it('a failed start renders `error`, never a fallback forever', async () => {
    const { engine } = countingEngine();
    const broken: AnyPlugin = {
      id: 'broken-ws',
      create: () => ({
        api: {},
        connect: () => {
          throw new Error('locale pack exploded');
        },
      }),
    };
    render(BootHarness, { props: { engine, plugins: [broken] } });

    await waitFor(() =>
      expect(screen.getByTestId('boot-error').textContent).toContain('locale pack exploded'),
    );
    expect(screen.queryByTestId('boot')).toBeNull();
  });

  it('reads engine and plugins once: a new value warns and is ignored', async () => {
    const { engine, open } = countingEngine();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(BootHarness, {
      props: { engine, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
    });
    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
    expect(open).toHaveBeenCalledTimes(1);

    await view.rerender({ plugins: [] });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reads engine and plugins once')),
    );
    expect(open).toHaveBeenCalledTimes(1); // no new kernel, nothing opened again
    expect(screen.getByTestId('shell')).toBeTruthy();
    warn.mockRestore();
  });
});

/**
 * Engine ownership follows the shape of `engine`: a function is the viewer's own (made on mount,
 * destroyed on unmount); an instance is borrowed (warmed up, never destroyed).
 */
describe('<Viewer> engine ownership', () => {
  it('a function is the viewer’s own: called on mount, its engine destroyed on unmount', async () => {
    const { engine, destroy } = countingEngine();
    const factory = vi.fn(() => engine);
    const view = render(BootHarness, {
      props: { engine: factory, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
    });

    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
    expect(factory).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  });

  it('only a local engine is warmed up', async () => {
    const { engine, warmup } = countingEngine({ local: false });
    const view = render(BootHarness, { props: { engine, plugins: [] } });
    await waitFor(() => expect(screen.getByTestId('shell')).toBeTruthy());
    expect(warmup).not.toHaveBeenCalled();
    view.unmount();
  });

  it('an instance is borrowed: warmed up on mount, never destroyed', async () => {
    const { engine, destroy, warmup, handles } = countingEngine();
    const view = render(BootHarness, {
      props: { engine, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
    });

    await waitFor(() => expect(screen.getByTestId('doc-ui')).toBeTruthy());
    expect(warmup).toHaveBeenCalled();
    view.unmount();

    await waitFor(() => expect(handles[0]!.close).toHaveBeenCalledTimes(1));
    expect(destroy).not.toHaveBeenCalled();
  });
});
