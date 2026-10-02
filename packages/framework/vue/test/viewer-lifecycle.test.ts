import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { toPageRef } from '@embedpdf/core';
import { LOCAL_ENGINE_BRAND } from '@embedpdf/core/testing';
import type { AnyPlugin, DocumentHandle, Engine, PageLayout, PluginContext } from '@embedpdf/core';
import { DocumentGate, Viewer, useKernel } from '../src/runtime';
import { until } from './counter-plugin';

/**
 * The Viewer's lifecycle: it creates and starts one kernel when it mounts and
 * destroys exactly that one when it unmounts (the documents it opened close);
 * the kernel is available to the fallback while it starts; a failed start
 * renders the `#error` slot; `engine` and `plugins` are read once. Engine
 * ownership follows the shape of `engine`: a function is the viewer's own, an
 * instance is borrowed.
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
const shell = () => h('div', { 'data-testid': 'shell' }, 'shell');

enableAutoUnmount(afterEach);

describe('<Viewer> lifecycle', () => {
  it('creates one kernel on mount and destroys exactly that one on unmount', async () => {
    const { engine, open, handles } = countingEngine();
    const constructed = vi.fn();
    const tornDown = vi.fn();
    const plugin: AnyPlugin = {
      id: 'ws-probe',
      token: { name: 'ws-probe' },
      create: (ctx: PluginContext<unknown>) => {
        constructed();
        ctx.cleanup(tornDown);
        return { api: {} };
      },
    };
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [plugin], initialDocuments: [{ source: bytesInput('a') }] },
      slots: {
        default: () =>
          h(DocumentGate, null, () => h('div', { 'data-testid': 'doc-ui' }, 'document ready')),
      },
    });
    await until(() => wrapper.find('[data-testid="doc-ui"]').exists());
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(handles[0].close).not.toHaveBeenCalled();

    wrapper.unmount();
    await until(() => tornDown.mock.calls.length === 1);
    await until(() => handles[0].close.mock.calls.length === 1);
  });

  it('renders the fallback with the kernel available, before the content', async () => {
    const { engine } = countingEngine();
    const statuses: string[] = [];
    const BootScreen = defineComponent({
      setup() {
        const kernel = useKernel(); // usable before the start completes
        statuses.push(kernel.status());
        return () => h('div', { 'data-testid': 'boot' }, 'booting');
      },
    });
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [] },
      slots: { default: shell, fallback: () => h(BootScreen) },
    });
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(statuses.length).toBeGreaterThan(0);
  });

  it('renders the #error slot when the start fails, never a silent forever-fallback', async () => {
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
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [broken] },
      slots: {
        default: shell,
        fallback: () => h('div', { 'data-testid': 'fallback' }, 'loading…'),
        error: ({ error }: { error: unknown }) =>
          h('div', { 'data-testid': 'boot-error' }, String(error)),
      },
    });
    await until(() => wrapper.find('[data-testid="boot-error"]').exists());
    expect(wrapper.find('[data-testid="boot-error"]').text()).toContain('locale pack exploded');
    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(false);
  });

  it('reads engine and plugins once: a new plugin list warns and is ignored', async () => {
    const { engine, open } = countingEngine();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
      slots: { default: shell },
    });
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(open).toHaveBeenCalledTimes(1);

    // A new list, as an inline `:plugins="[…]"` makes on every render.
    await wrapper.setProps({ plugins: [] });
    await until(() => warn.mock.calls.some(([message]) => String(message).includes('read once')));
    expect(open).toHaveBeenCalledTimes(1); // no new kernel, no second open
    expect(wrapper.find('[data-testid="shell"]').exists()).toBe(true);
    warn.mockRestore();
  });

  it('exposes the started kernel on its template ref', async () => {
    const { engine } = countingEngine();
    const viewer = ref<{ kernel: unknown } | null>(null);
    const Host = defineComponent({
      setup() {
        return () => h(Viewer, { ref: viewer, engine, plugins: [] }, { default: shell });
      },
    });
    const wrapper = mount(Host);
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(viewer.value?.kernel).toMatchObject({ status: expect.any(Function) });
  });
});

describe('<Viewer> engine ownership', () => {
  it('a function is the viewer’s own engine: called on mount, destroyed on unmount', async () => {
    const { engine, destroy } = countingEngine();
    const thunk = vi.fn(() => engine);
    const wrapper = mount(Viewer, {
      props: { engine: thunk, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
      slots: { default: shell },
    });
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(thunk).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();

    wrapper.unmount();
    await until(() => destroy.mock.calls.length === 1);
  });

  it('only warms up a local engine', async () => {
    const { engine, warmup } = countingEngine({ local: false });
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [] },
      slots: { default: shell },
    });
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(warmup).not.toHaveBeenCalled();
  });

  it('borrows an instance: warmed up on mount, never destroyed', async () => {
    const { engine, destroy, warmup, handles } = countingEngine();
    const wrapper = mount(Viewer, {
      props: { engine, plugins: [], initialDocuments: [{ source: bytesInput('a') }] },
      slots: { default: shell },
    });
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    expect(warmup).toHaveBeenCalled();
    await until(() => handles.length === 1);
    wrapper.unmount();

    // The kernel's teardown closes the document it opened…
    await until(() => handles[0].close.mock.calls.length === 1);
    // …and leaves the borrowed engine alone.
    expect(destroy).not.toHaveBeenCalled();
  });

  it('a remount calls the function again; the first engine is destroyed with its viewer', async () => {
    const engines: { destroy: ReturnType<typeof vi.fn> }[] = [];
    const thunk = vi.fn(() => {
      const { engine, destroy } = countingEngine();
      engines.push({ destroy });
      return engine;
    });
    const generation = ref(0);
    const Host = defineComponent({
      setup() {
        return () =>
          h(Viewer, { key: generation.value, engine: thunk, plugins: [] }, { default: shell });
      },
    });
    const wrapper = mount(Host);
    await until(() => wrapper.find('[data-testid="shell"]').exists());
    generation.value += 1;
    await until(() => engines.length === 2 && wrapper.find('[data-testid="shell"]').exists());
    await until(() => engines[0].destroy.mock.calls.length === 1);
    expect(engines[1].destroy).not.toHaveBeenCalled();

    wrapper.unmount();
    await until(() => engines[1].destroy.mock.calls.length === 1);
  });
});
