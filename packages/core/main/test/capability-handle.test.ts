import { describe, expect, it } from 'vitest';

import {
  createCapabilityToken,
  definePlugin,
  isPluginError,
  isReadMember,
  PluginError,
  returnsPromise,
  standInFor,
} from '../src/index';
import { createKernel } from '../src/kernel';
import type { AnyPlugin, PromiseMembers } from '../src/types';
import { immediateEngine } from './helpers';

/**
 * What every framework adapter's plugin API shares: the read vocabulary, and the stand-in a
 * document plugin's API reaches with no document, which refuses with `not-ready` (a rejected
 * promise for the members its token lists in `promises`, a throw for the others).
 */

interface NotesCapability {
  getCount(): number;
  increment(): void;
  save(name: string): Promise<void>;
  readonly comments: { reply(text: string): Promise<string>; list(): readonly string[] };
  getSettings(): { readonly step: number };
  updateSettings(changes: { step?: number }): void;
  resetSettings(): void;
}

const NotesToken = createCapabilityToken<NotesCapability>('notes', {
  promises: { save: true, 'comments.reply': true },
});

const notesPlugin = definePlugin({
  id: 'notes',
  scope: 'document',
  token: NotesToken,
  settings: { defaults: { step: 1 } },
  create: (ctx) => ({
    api: {
      ...ctx.settings().api,
      getCount: () => 0,
      increment: () => {},
      save: async () => {},
      comments: { reply: async (text: string) => text, list: () => [] },
    },
  }),
});

async function startedKernel(plugins: AnyPlugin[] = [notesPlugin]) {
  const kernel = createKernel({ engine: immediateEngine(), plugins });
  await kernel.start();
  return kernel;
}

const thrown = (call: () => unknown): unknown => {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
};

describe('isReadMember', () => {
  it('reads get, list, is, has and can, alone or followed by a capital', () => {
    for (const name of [
      'get',
      'getZoomLevel',
      'list',
      'listHits',
      'isMoving',
      'hasTool',
      'canCopy',
    ]) {
      expect(isReadMember(name)).toBe(true);
    }
  });

  it('reads nothing else, nor a word that only starts like one', () => {
    for (const name of ['zoomIn', 'setValue', 'refresh', 'getter', 'listen', 'island', 'canvas']) {
      expect(isReadMember(name)).toBe(false);
    }
  });
});

describe('returnsPromise', () => {
  it('answers from the token, by path', () => {
    expect(returnsPromise(NotesToken, 'save')).toBe(true);
    expect(returnsPromise(NotesToken, 'comments.reply')).toBe(true);
    expect(returnsPromise(NotesToken, 'increment')).toBe(false);
    expect(returnsPromise(createCapabilityToken<NotesCapability>('bare'), 'save')).toBe(false);
  });

  it('asks the token for every member that returns a promise, and only those', () => {
    const complete: PromiseMembers<NotesCapability> = { save: true, 'comments.reply': true };
    // @ts-expect-error `comments.reply` returns a promise too
    const missing: PromiseMembers<NotesCapability> = { save: true };
    // @ts-expect-error `increment` returns nothing
    const extra: PromiseMembers<NotesCapability> = { ...complete, increment: true };
    expect([complete, missing, extra]).toHaveLength(3);
  });
});

describe('standInFor', () => {
  it('throws not-ready from a member that returns a value', async () => {
    const notes = standInFor(await startedKernel(), NotesToken);
    const error = thrown(() => notes.increment());
    expect(error).toBeInstanceOf(PluginError);
    expect(isPluginError(error, 'not-ready')).toBe(true);
    expect((error as PluginError).capability).toBe('notes');
    expect((error as PluginError).message).toBe('no document is open');
    expect(
      isPluginError(
        thrown(() => notes.comments.list()),
        'not-ready',
      ),
    ).toBe(true);
  });

  it('rejects not-ready from a member the token lists in promises, without throwing', async () => {
    const notes = standInFor(await startedKernel(), NotesToken);
    let pending: Promise<unknown> | null = null;
    expect(() => (pending = notes.save('draft'))).not.toThrow();
    await expect(pending).rejects.toMatchObject({ code: 'not-ready', capability: 'notes' });
    await expect(notes.comments.reply('hi')).rejects.toMatchObject({ code: 'not-ready' });
  });

  it('is one stand-in per kernel and token, with stable members, and no thenable', async () => {
    const kernel = await startedKernel();
    const notes = standInFor(kernel, NotesToken);
    expect(standInFor(kernel, NotesToken)).toBe(notes);
    expect(standInFor(await startedKernel(), NotesToken)).not.toBe(notes);
    expect(notes.increment).toBe(notes.increment);
    expect(notes.comments).toBe(notes.comments);
    expect(notes.comments.reply).toBe(notes.comments.reply);
    expect((notes as unknown as { then?: unknown }).then).toBeUndefined();
    expect((notes as unknown as { __v_isRef?: unknown }).__v_isRef).toBeUndefined();
    await expect(Promise.resolve(notes)).resolves.toBe(notes);
  });

  it('reaches the plugin settings with no document', async () => {
    const kernel = await startedKernel();
    const notes = standInFor(kernel, NotesToken);
    expect(notes.getSettings()).toEqual({ step: 1 });
    notes.updateSettings({ step: 3 });
    expect(kernel.settingsOf(NotesToken).getSettings()).toEqual({ step: 3 });
    notes.resetSettings();
    expect(notes.getSettings()).toEqual({ step: 1 });
  });

  it('refuses the settings calls for a plugin whose definition declares no settings', async () => {
    const PlainToken = createCapabilityToken<{ getSettings(): object }>('plain');
    const plain: AnyPlugin = {
      id: 'plain',
      token: PlainToken,
      scope: 'document',
      create: () => ({ api: { getSettings: () => ({}) } }),
    };
    const standIn = standInFor(await startedKernel([plain]), PlainToken);
    expect(
      isPluginError(
        thrown(() => standIn.getSettings()),
        'not-ready',
      ),
    ).toBe(true);
  });
});
