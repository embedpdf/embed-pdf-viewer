import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { CommandDefinition, CommandFamily } from '@embedpdf/core';

import { createInteractionCommands, toolCommand } from '../src/commands';
import { InteractionToken } from '../src/contract';

const interactionCommands = createInteractionCommands();
const family = interactionCommands.find((item): item is CommandFamily => 'prefix' in item)!;
const defined = interactionCommands.filter((item): item is CommandDefinition => 'id' in item);

describe('createInteractionCommands', () => {
  it('has the built-in tools with their keys, and a family for every other tool', () => {
    expect(defined.map((item) => [item.id, item.shortcut])).toEqual([
      ['tool:pointer', 'V'],
      ['tool:pan', 'H'],
      ['tool:zoom', 'Z'],
    ]);
    expect(interactionCommands.at(-1)).toBe(family);
  });

  it('has a tool command for every tool the document has', () => {
    const tools = [{ id: 'pointer' }, { id: 'pan' }, { id: 'highlight' }];
    const interaction = {
      listTools: () => tools,
      hasTool: (id: string) => tools.some((tool) => tool.id === id),
      getActiveToolId: () => 'highlight',
      activateTool: vi.fn(),
      // The tool says so itself: highlight makes an annotation, which this user may not.
      canUseTool: (id: string) => id !== 'highlight',
    };
    const context = createTestCommandContext([[InteractionToken, interaction]]);
    expect(family.prefix).toBe('tool:');
    expect(family.names(context)).toEqual(['pointer', 'pan', 'highlight']);
    expect(family.names(context)).toBe(family.names(context));

    const highlight = family.command('highlight');
    expect(highlight).toMatchObject({ labelKey: 'commands.tool.highlight', icon: 'highlight' });
    expect(highlight.active?.(context)).toBe(true);
    expect(highlight.visible?.(context)).toBe(true);
    expect(highlight.enabled?.(context)).toBe(false); // the tool says the user may not
    expect(family.command('pan').enabled?.(context)).toBe(true);
    expect(family.command('ink').visible?.(context)).toBe(false);
    highlight.run?.(context);
    expect(interaction.activateTool).toHaveBeenCalledWith('highlight');
  });

  it('lets a tool have a command of its own, for a shortcut or a permission', () => {
    const own = { ...toolCommand('stamp'), id: 'tool:stamp', shortcut: 'S' };
    expect(own).toMatchObject({ labelKey: 'commands.tool.stamp', icon: 'stamp', shortcut: 'S' });
    // Without the interaction plugin there is no such tool to show.
    expect(own.visible?.(createTestCommandContext())).toBe(false);
  });
});
