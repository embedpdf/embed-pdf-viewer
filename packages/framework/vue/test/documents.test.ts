import { h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
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
import { bytesInput, counterPlugin, probe, settle, until, viewerWith } from './counter-plugin';

/**
 * The documents in Vue: `useDocuments()` is the API (its calls use the
 * document in scope), `useDocument()` and `useDocumentsState()` what to show,
 * `<DocumentGate>` what to render for each state, and `<Viewer>`'s own settings.
 */

type Documents = ReturnType<typeof useDocuments>;

const latest = <Value>(values: Value[]) => values[values.length - 1];
const plugins = [counterPlugin];

enableAutoUnmount(afterEach);

describe('useDocuments', () => {
  it('downloads the document in scope when download() has no id, and the active one outside a scope', async () => {
    const found: { scoped?: Documents; unscoped?: Documents } = {};
    const Scoped = probe(() => {
      found.scoped = useDocuments();
    });
    const Unscoped = probe(() => {
      found.unscoped = useDocuments();
    });
    const { kernel } = await viewerWith(plugins, () => [
      h(DocumentScope, { id: 'b' }, () => h(Scoped)),
      h(Unscoped),
    ]);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');
    await settle();

    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(decode(await found.scoped!.download())).toBe('b');
    expect(decode(await found.unscoped!.download())).toBe('a');
  });

  it('is one object for the component’s life, however the documents change', async () => {
    let documents: Documents | null = null;
    const Probe = probe(() => {
      documents = useDocuments();
      return () => h('span', documents!.list().length);
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    const first = documents;
    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(documents).toBe(first);
    expect(documents!.list()).toHaveLength(1);
  });
});

describe('useDocument and useDocumentsState', () => {
  it('read the document in scope, every document, and an empty one without any', async () => {
    const documents: DocumentInfo[] = [];
    const states: { documents: readonly DocumentInfo[]; activeId: string | null }[] = [];
    const Probe = probe(() => {
      const document = useDocument((value) => value);
      const { documents: open, activeId } = useDocumentsState();
      return () => {
        documents.push(document.value);
        states.push({ documents: open.value, activeId: activeId.value });
        return null;
      };
    });
    const Scoped = probe(() => {
      const { id } = useDocument();
      return () => h('span', { 'data-testid': 'scoped' }, id.value);
    });
    const { kernel, wrapper } = await viewerWith(plugins, () => [
      h(Probe),
      h(DocumentScope, { id: 'a' }, () => h(Scoped)),
    ]);
    expect(latest(documents)).toMatchObject({ id: '', status: 'loading', hasUnsavedChanges: false });
    expect(latest(states)).toEqual({ documents: [], activeId: null });

    await kernel.documents.open(bytesInput('a'), { name: 'Contract' });
    await kernel.documents.open(bytesInput('b'));
    await settle();
    expect(latest(documents)).toMatchObject({ id: 'b', status: 'ready', pageCount: 1 });
    expect(latest(states).activeId).toBe('b');
    expect(latest(states).documents.map((document) => document.name)).toEqual([
      'Contract',
      undefined,
    ]);
    expect(wrapper.find('[data-testid="scoped"]').text()).toBe('a');
  });
});

describe('useDocumentsEvent', () => {
  it('subscribes once, and stops when the component unmounts', async () => {
    const opened = vi.fn();
    const shown = ref(true);
    const Probe = probe(() => {
      useDocumentsEvent((documents) => documents.onOpened, opened);
    });
    const { kernel } = await viewerWith(plugins, () => (shown.value ? h(Probe) : null));
    await kernel.documents.open(bytesInput('a'));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0][0]).toMatchObject({ documentId: 'a' });

    shown.value = false;
    await nextTick();
    await kernel.documents.open(bytesInput('b'));
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

describe('usePageList', () => {
  it('lists the pages of the document in scope, with no Stage', async () => {
    const lists: (readonly unknown[])[] = [];
    const Probe = probe(() => {
      const pages = usePageList();
      return () => {
        lists.push(pages.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    expect(latest(lists)).toEqual([]);
    await kernel.documents.open(bytesInput('a'));
    await settle();
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

  it('renders #locked and #error with the document, and #fallback otherwise', async () => {
    const gate = () =>
      h(DocumentGate, null, {
        default: () => h('p', 'ready'),
        fallback: () => h('p', 'opening'),
        locked: ({ document }: { document: DocumentInfo }) =>
          h('p', `locked ${String(document.passwordProvided)}`),
        error: ({ document }: { document: DocumentInfo & { error: { message: string } } }) =>
          h('p', `failed: ${document.error.message}`),
      });
    const { kernel, wrapper } = await viewerWith(plugins, gate, engine);
    const text = () => wrapper.find('[data-testid="mounted"]').text();
    expect(text()).toBe('opening');
    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(text()).toBe('locked true');
    await kernel.documents.open(bytesInput('b')).catch(() => {});
    await settle();
    expect(text()).toBe('failed: corrupt file');
  });
});

describe('the Viewer’s own settings', () => {
  it('follow the props, and a prop left out is its default', async () => {
    let kernel: Kernel | null = null;
    const accents: string[] = [];
    const Probe = probe(() => {
      const accent = useViewerSettings((settings) => settings.accent);
      return () => {
        accents.push(accent.value);
        return h('span', { 'data-testid': 'probe' });
      };
    });
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
    const wrapper = mount(Viewer, {
      props: {
        engine: engine as unknown as Engine,
        plugins,
        identity: { userId: 'u1' },
        page: { shadow: 'none' },
        accent: '#e91e63',
        scope: ['doc.open'],
        initialDocuments: [{ source: bytesInput('a') }],
        onReady: (ready: Kernel) => {
          kernel = ready;
        },
      },
      slots: { default: () => h(Probe) },
    });
    await until(() => wrapper.find('[data-testid="probe"]').exists());
    await until(() => engine.open.mock.calls.length > 0);
    // The initial documents open with the first props.
    expect(engine.open.mock.calls[0][1]).toEqual({
      scope: ['doc.open'],
      identity: { userId: 'u1' },
    });
    expect(latest(accents)).toBe('#e91e63');
    expect(kernel!.getSettings().page).toEqual({ background: '#ffffff', shadow: 'none' });

    await wrapper.setProps({ accent: undefined, scope: undefined });
    await settle();
    expect(latest(accents)).toBe('#3858e9');
    expect(kernel!.getSettings().scope).toBeNull();
  });

  it('gives a ref for every setting without a selector', async () => {
    const Probe = probe(() => {
      const { accent, page } = useViewerSettings();
      return () => h('span', `${accent.value} ${page.value.shadow}`);
    });
    const { wrapper } = await viewerWith(plugins, () => h(Probe));
    expect(wrapper.text()).toMatch(/^#3858e9 /);
  });
});
