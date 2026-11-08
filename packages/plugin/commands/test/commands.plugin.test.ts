import { createKernel, type DocumentHandle, type Engine } from '@embedpdf/core';
import { describe, expect, it, vi } from 'vitest';

import { i18nPlugin } from '@embedpdf/plugin-i18n';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';

import { commandsPlugin } from '../src/commands.plugin';
import type { CommandDefinition } from '../src/contract';
import { CommandsToken } from '../src/host-contract';

/**
 * The commands capability inside a document's scope: a call that leaves out the document
 * targets the document in scope, and a call outside any scope the active one.
 */

/** An engine whose documents open at once, each with no pages. */
const engine = {
  open: (input: { id: string }) =>
    Promise.resolve({
      id: input.id,
      events: { subscribe: () => () => {}, lastServerSequence: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 0, labels: [], pages: [] }) },
      security: { allows: () => true },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

const openDocument = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });

/** Documents `a` and `b`, with `b` active, and two commands that show their target. */
async function twoDocuments() {
  const ran: (string | null)[] = [];
  const commands: CommandDefinition[] = [
    { id: 'show', label: 'show', run: (context) => void ran.push(context.documentId) },
    { id: 'only-a', label: 'only a', enabled: (context) => context.documentId === 'a' },
  ];
  const kernel = createKernel({ engine, plugins: [commandsPlugin({ commands })] });
  await kernel.start();
  await kernel.documents.open(openDocument('a'));
  await kernel.documents.open(openDocument('b'));
  expect(kernel.documents.getActiveId()).toBe('b');
  return { kernel, ran };
}

describe('commands in a document scope', () => {
  it('executes for the document in scope, and for the active one outside', async () => {
    const { kernel, ran } = await twoDocuments();
    const executed = vi.fn();
    kernel.capability(CommandsToken).onExecuted(executed);

    await kernel.capability(CommandsToken, 'a').execute('show', { args: 1 });
    await kernel.capability(CommandsToken).execute('show');
    await kernel.capability(CommandsToken, 'a').execute('show', { documentId: 'b' }); // named wins
    expect(ran).toEqual(['a', 'b', 'b']);
    expect(executed).toHaveBeenNthCalledWith(1, { commandId: 'show', documentId: 'a', args: 1 });
    await kernel.destroy();
  });

  it('resolves, lists, searches and checks against the document in scope', async () => {
    const { kernel } = await twoDocuments();
    const inA = kernel.capability(CommandsToken, 'a');
    const outside = kernel.capability(CommandsToken);

    expect(inA.canExecute('only-a')).toBe(true);
    expect(outside.canExecute('only-a')).toBe(false);
    expect(inA.canExecute('only-a', 'b')).toBe(false);
    expect(inA.resolveCommand('only-a')?.enabled).toBe(true);
    expect(inA.resolveCommand('only-a')).toBe(outside.resolveCommand('only-a', 'a'));
    expect(inA.listCommands()).toBe(outside.listCommands('a'));
    expect(inA.searchCommands('only')[0]?.enabled).toBe(true);
    expect(outside.searchCommands('only')[0]?.enabled).toBe(false);
    expect(await inA.execute('only-a')).toEqual({ status: 'executed' });
    expect(await outside.execute('only-a')).toEqual({ status: 'rejected', reason: 'disabled' });
    await kernel.destroy();
  });

  it('is the same object on every call for one document', async () => {
    const { kernel } = await twoDocuments();
    const inA = kernel.capability(CommandsToken, 'a');
    expect(kernel.capability(CommandsToken, 'a')).toBe(inA);
    expect(kernel.tryCapability(CommandsToken, 'a')).toBe(inA);
    expect(inA.matchStroke).toBe(kernel.capability(CommandsToken).matchStroke); // the host lens stays
    await kernel.destroy();
  });
});

describe('a label with values', () => {
  interface Outbox {
    recipients: string[];
  }

  /** A command whose label says how many people it sends to, from your app's state. */
  const send: CommandDefinition<Outbox> = {
    id: 'acme:send',
    labelKey: 'acme.send',
    label: 'Send ({count})',
    labelParams: ({ appState }) => ({ count: appState.recipients.length }),
  };

  const english = {
    code: 'en',
    name: 'English',
    translations: {
      acme: { send: { one: 'Send to {count} person', other: 'Send to {count} people' } },
    },
  };

  it("fills its translation's slots, picks the plural for a count, and follows the values", async () => {
    const kernel = createKernel({
      engine,
      plugins: [
        i18nPlugin({ locales: [english] }),
        commandsPlugin<Outbox>({ appState: { recipients: ['ana'] }, commands: [send] }),
      ],
    });
    await kernel.start();
    const commands = kernel.capability(CommandsToken);
    expect(commands.resolveCommand('acme:send')?.label).toBe('Send to 1 person');
    commands.updateSettings({ appState: { recipients: ['ana', 'bo', 'cy'] } });
    expect(commands.resolveCommand('acme:send')?.label).toBe('Send to 3 people');
    expect(commands.searchCommands('3 people').map((command) => command.id)).toEqual(['acme:send']);

    // A string under the command's id takes the same values.
    kernel.capability(I18nToken).addTranslations('en', { 'acme:send': 'Mail {count}' });
    expect(commands.resolveCommand('acme:send')?.label).toBe('Mail 3');
    await kernel.destroy();
  });

  it('fills `label` without the i18n plugin, and shows the slots when labelParams throws', async () => {
    const kernel = createKernel({
      engine,
      plugins: [
        commandsPlugin<Outbox>({
          appState: { recipients: ['ana', 'bo'] },
          commands: [
            { ...send, labelKey: undefined },
            {
              id: 'acme:broken',
              label: 'Broken ({count})',
              labelParams: () => {
                throw new Error('not there yet');
              },
            },
          ],
        }),
      ],
    });
    await kernel.start();
    const commands = kernel.capability(CommandsToken);
    expect(commands.resolveCommand('acme:send')?.label).toBe('Send (2)');
    commands.updateSettings({ appState: { recipients: ['ana', 'bo', 'cy', 'di', 'ed'] } });
    expect(commands.resolveCommand('acme:send')?.label).toBe('Send (5)');
    expect(commands.resolveCommand('acme:broken')?.label).toBe('Broken ({count})');
    await kernel.destroy();
  });
});
