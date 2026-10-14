/**
 * The `viewer` and the end of its life: while it lives, every API it hands out is the plugin's
 * own; once it's disposed, what was subscribed through it stops, reads throw `instance-closed`,
 * every other call rejects with it, and a new subscription does nothing.
 */
import { describe, expect, it } from 'vitest';

import {
  DocumentsToken,
  PluginError,
  createEventHook,
  type CapabilityToken,
  type Kernel,
} from '@embedpdf/core';
import { CommandsToken } from '@embedpdf/plugin-commands';
import { createViewer, VIEWER_KERNEL } from '../../../chrome/src/handle';

const SearchToken: CapabilityToken<unknown> = { name: 'search' };

/** A kernel with the documents, the commands and a search plugin, each with an event. */
function fakeKernel() {
  const opened = createEventHook<{ documentId: string }>();
  const executed = createEventHook<{ commandId: string }>();
  const listeners = new Set<() => void>();
  let activeId: string | null = 'one';
  const documents = {
    getActiveId: () => activeId,
    close: async (id: string) => id,
    setActive: (id: string) => {
      activeId = id;
      for (const listener of listeners) listener();
    },
    onOpened: opened.on,
  };
  const commands = Object.freeze({
    execute: async (id: string) => ({ status: 'executed', id }),
    onExecuted: executed.on,
  });
  const search = {
    search: async () => 3,
    getHitCount: () => 3,
    tools: { register: (name: string) => () => name },
  };
  const capabilities = new Map<CapabilityToken<unknown>, object>([
    [DocumentsToken, documents],
    [CommandsToken, commands],
    [SearchToken, search],
  ]);
  const kernel = {
    documents,
    capability: (token: CapabilityToken<unknown>) => capabilities.get(token)!,
    tryCapability: (token: CapabilityToken<unknown>) => capabilities.get(token) ?? null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  } as unknown as Kernel;
  return { kernel, documents, search, opened, executed, listeners };
}

const tokens = { documents: DocumentsToken, commands: CommandsToken, search: SearchToken };

/** The refusal a call to a viewer that's done makes, or `null` when it made none. */
const refusalOf = async (call: () => unknown): Promise<PluginError | null> => {
  try {
    await call();
    return null;
  } catch (error) {
    return error as PluginError;
  }
};

describe('createViewer', () => {
  it("hands out each plugin's own API while it lives", async () => {
    const { kernel, search, documents } = fakeKernel();
    const { viewer } = createViewer(kernel, tokens);
    const searchApi = viewer.get('search' as never) as typeof search;
    expect(searchApi).toBe(viewer.get('search' as never));
    expect(searchApi.search).toBe(searchApi.search);
    expect(await searchApi.search()).toBe(3);
    expect(searchApi.getHitCount()).toBe(3);
    expect(viewer.documents.getActiveId()).toBe(documents.getActiveId());
    expect(await viewer.commands.execute('zoom:in')).toEqual({ status: 'executed', id: 'zoom:in' });
    expect(Object.keys(searchApi)).toEqual(Object.keys(search));
    expect((viewer as unknown as Record<symbol, unknown>)[VIEWER_KERNEL]).toBe(kernel);
  });

  it('stops every listener, registration and watch made through it when disposed', () => {
    const { kernel, documents, opened, executed, listeners } = fakeKernel();
    const { viewer, dispose } = createViewer(kernel, tokens);
    const heard: string[] = [];
    viewer.documents.onOpened(({ documentId }) => heard.push(`opened ${documentId}`));
    viewer.commands.onExecuted(({ commandId }) => heard.push(`executed ${commandId}`));
    viewer.watch(
      () => viewer.documents.getActiveId(),
      (id) => heard.push(`active ${id}`),
    );
    opened.emit({ documentId: 'two' });
    documents.setActive('two');
    expect(heard).toEqual(['opened two', 'active two']);

    dispose();
    opened.emit({ documentId: 'three' });
    executed.emit({ commandId: 'zoom:in' });
    documents.setActive('three');
    expect(heard).toEqual(['opened two', 'active two']);
    expect(listeners.size).toBe(0);
  });

  it('ends one subscription when it is stopped, and keeps the others', () => {
    const { kernel, opened } = fakeKernel();
    const { viewer } = createViewer(kernel, tokens);
    const heard: string[] = [];
    const stop = viewer.documents.onOpened(() => heard.push('first'));
    viewer.documents.onOpened(() => heard.push('second'));
    stop();
    opened.emit({ documentId: 'two' });
    expect(heard).toEqual(['second']);
  });

  it('refuses every call with instance-closed once disposed', async () => {
    const { kernel } = fakeKernel();
    const { viewer, dispose } = createViewer(kernel, tokens);
    const kept = viewer.get('search' as never) as {
      search(): Promise<number>;
      getHitCount(): number;
    };
    dispose();
    dispose();

    for (const call of [
      () => viewer.get('search' as never),
      () => viewer.documents.getActiveId(),
      () => kept.getHitCount(),
    ]) {
      expect(() => call()).toThrow(PluginError);
    }
    const rejected = [
      viewer.commands.execute('zoom:in'),
      viewer.documents.close('one'),
      kept.search(),
    ];
    for (const refusal of await Promise.all(rejected.map((call) => refusalOf(() => call)))) {
      expect(refusal).toBeInstanceOf(PluginError);
      expect(refusal?.code).toBe('instance-closed');
      expect(refusal?.message).toMatch(/new onReady/);
    }
    expect(viewer.tryGet('search' as never)).toBeNull();
  });

  it('makes a new subscription on a disposed viewer do nothing', () => {
    const { kernel, opened, listeners } = fakeKernel();
    const { viewer, dispose } = createViewer(kernel, tokens);
    dispose();
    const heard: string[] = [];
    const stop = viewer.documents.onOpened(() => heard.push('opened'));
    const unwatch = viewer.watch(
      () => 1,
      () => heard.push('changed'),
    );
    opened.emit({ documentId: 'two' });
    expect(heard).toEqual([]);
    expect(listeners.size).toBe(0);
    expect(() => {
      stop();
      unwatch();
    }).not.toThrow();
  });

  it("names a plugin of the app's own by the name it was given", () => {
    const { kernel } = fakeKernel();
    const { viewer } = createViewer(kernel, { ...tokens, analytics: SearchToken });
    expect(viewer.get('analytics' as never)).toBe(viewer.get('search' as never));
    expect(() => viewer.get('nothing' as never)).toThrow(/no plugin named "nothing"/);
  });
});
