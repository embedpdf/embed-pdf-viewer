import { DocumentsToken, type CapabilityToken } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { describe, expect, it, vi } from 'vitest';

import type { CommandContext, CommandDef, CommandFamily } from '../src/contract';
import { createStandardCommands } from '../src/standard';

/** A command context over stand-in capabilities, for the document `doc`. */
function contextWith(capabilities: Map<CapabilityToken<unknown>, unknown>): CommandContext {
  const tryGet = <T>(token: CapabilityToken<T>): T | null =>
    (capabilities.get(token as CapabilityToken<unknown>) as T | undefined) ?? null;
  return {
    documentId: 'doc',
    tryGet,
    get: <T>(token: CapabilityToken<T>): T => {
      const capability = tryGet(token);
      if (!capability) throw new Error(`no ${token.name}`);
      return capability;
    },
  };
}

const platform = () => ({
  copySelection: vi.fn(async () => 'text'),
  saveFile: vi.fn(),
});

function standard(platformImpl = platform()) {
  const items = createStandardCommands(platformImpl);
  const command = (id: string) =>
    items.find((item): item is CommandDef => 'id' in item && item.id === id)!;
  const family = items.find((item): item is CommandFamily => 'prefix' in item)!;
  return { items, command, family, platform: platformImpl };
}

describe('standard commands', () => {
  it('has the commands the commands page lists, with their shortcuts', () => {
    const { items } = standard();
    const defined = items.filter((item): item is CommandDef => 'id' in item);
    expect(Object.fromEntries(defined.map((item) => [item.id, item.shortcut ?? null]))).toEqual({
      'zoom:in': ['Mod+=', 'Mod+NumpadAdd'],
      'zoom:out': ['Mod+-', 'Mod+NumpadSubtract'],
      'zoom:fit-width': null,
      'zoom:fit-page': null,
      'page:next': 'ArrowRight',
      'page:previous': 'ArrowLeft',
      'page:first': 'Home',
      'page:last': 'End',
      'view:rotate-clockwise': null,
      'view:rotate-counterclockwise': null,
      'tool:pointer': 'V',
      'tool:pan': 'H',
      'tool:zoom': 'Z',
      'selection:copy': 'Mod+C',
      'annotation:delete': ['Delete', 'Backspace'],
      'document:download': 'Mod+S',
      'document:print': 'Mod+P',
    });
    expect(defined.every((item) => item.labelKey?.startsWith('commands.') && item.label)).toBe(
      true,
    );
  });

  it('moves through pages only where there is somewhere to go', () => {
    const { command } = standard();
    const stage = { canGoNext: () => false, canGoPrevious: () => true, previousPage: vi.fn() };
    const context = contextWith(new Map([[StageToken, stage]]));
    expect(command('page:next').enabled?.(context)).toBe(false);
    expect(command('page:last').enabled?.(context)).toBe(false);
    expect(command('page:previous').enabled?.(context)).toBe(true);
    command('page:previous').run?.(context);
    expect(stage.previousPage).toHaveBeenCalled();
    expect(command('zoom:in').enabled?.(contextWith(new Map()))).toBe(false);
  });

  it('zooms only while the zoom is inside its limits', () => {
    const { command } = standard();
    const stage = { canZoomIn: () => false, canZoomOut: () => true };
    const context = contextWith(new Map([[StageToken, stage]]));
    expect(command('zoom:in').enabled?.(context)).toBe(false);
    expect(command('zoom:out').enabled?.(context)).toBe(true);
  });

  it('has a tool command for every tool the document has', () => {
    const { family } = standard();
    const tools = [{ id: 'pointer' }, { id: 'pan' }, { id: 'highlight' }];
    const interaction = {
      listTools: () => tools,
      hasTool: (id: string) => tools.some((tool) => tool.id === id),
      getActiveToolId: () => 'highlight',
      activateTool: vi.fn(),
    };
    const annotation = {
      tools: { get: (id: string) => (id === 'highlight' ? {} : null) },
      canCreate: () => false,
    };
    const context = contextWith(
      new Map<CapabilityToken<unknown>, unknown>([
        [InteractionToken, interaction],
        [AnnotationToken, annotation],
      ]),
    );
    expect(family.prefix).toBe('tool:');
    expect(family.names(context)).toEqual(['pointer', 'pan', 'highlight']);
    expect(family.names(context)).toBe(family.names(context));

    const highlight = family.command('highlight');
    expect(highlight).toMatchObject({ labelKey: 'commands.tool.highlight', icon: 'highlight' });
    expect(highlight.active?.(context)).toBe(true);
    expect(highlight.visible?.(context)).toBe(true);
    expect(highlight.enabled?.(context)).toBe(false); // may not create annotations
    expect(family.command('pan').enabled?.(context)).toBe(true);
    expect(family.command('ink').visible?.(context)).toBe(false);
    highlight.run?.(context);
    expect(interaction.activateTool).toHaveBeenCalledWith('highlight');
  });

  it('copies a selection the user may copy', async () => {
    const { command, platform } = standard();
    const selection = { hasSelection: () => true, canCopy: () => false };
    const context = contextWith(new Map([[SelectionToken, selection]]));
    expect(command('selection:copy').enabled?.(context)).toBe(false);
    selection.canCopy = () => true;
    expect(command('selection:copy').enabled?.(context)).toBe(true);
    await command('selection:copy').run?.(context);
    expect(platform.copySelection).toHaveBeenCalledWith(selection);
  });

  it('deletes a selection only when every annotation in it may be deleted, by hand', () => {
    const { command } = standard();
    const refs = [{ id: 1 }, { id: 2 }];
    const annotation = {
      selection: { list: () => refs.map((ref) => ({ ref })), delete: vi.fn() },
      canDelete: (ref: { id: number }) => ref.id === 1,
      isEditable: (_ref: { id: number }) => true,
    };
    const context = contextWith(new Map([[AnnotationToken, annotation]]));
    expect(command('annotation:delete').enabled?.(context)).toBe(false);
    annotation.canDelete = () => true;
    expect(command('annotation:delete').enabled?.(context)).toBe(true);
    // One the `editable` setting freezes stays.
    annotation.isEditable = (ref) => ref.id === 1;
    expect(command('annotation:delete').enabled?.(context)).toBe(false);
  });

  it('downloads the document as a file named after it', async () => {
    const { command, platform } = standard();
    const bytes = new Uint8Array([1, 2]);
    const documents = {
      download: vi.fn(async () => bytes),
      get: () => ({ name: 'contract' }),
      canDownload: () => true,
      canPrint: () => false,
    };
    const context = contextWith(new Map([[DocumentsToken, documents]]));
    // The documents' own checks say whether the session may: the commands plugin hides them
    // when they say no, with the permission's sentence.
    expect(command('document:download').requires).toBeUndefined();
    expect(command('document:download').allowed?.(context)).toBe(true);
    expect(command('document:print').allowed?.(context)).toBe(false);
    expect(command('document:download').notAllowedKey).toBe('commands.notAllowed.doc-download');
    expect(command('document:print').notAllowedKey).toBe('commands.notAllowed.doc-print');
    expect(command('document:download').enabled?.(context)).toBe(true);
    expect(command('document:print').enabled?.({ ...context, documentId: null })).toBe(false);
    await command('document:download').run?.(context);
    expect(documents.download).toHaveBeenCalledWith('doc', { signal: undefined });
    expect(platform.saveFile).toHaveBeenCalledWith(bytes, 'contract.pdf');
  });

  it('prints the document in scope through the kernel', async () => {
    const { command } = standard();
    const documents = { print: vi.fn(async () => {}), canPrint: () => true };
    const context = contextWith(new Map([[DocumentsToken, documents]]));
    expect(command('document:print').allowed?.(context)).toBe(true);
    await command('document:print').run?.(context);
    expect(documents.print).toHaveBeenCalledWith('doc', { signal: undefined });
  });
});
