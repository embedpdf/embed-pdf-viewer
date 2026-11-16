/**
 * @embedpdf/plugin-interaction/commands — a command for every tool: the
 * built-in tools with Acrobat's single keys, and `tool:<id>` for every other
 * tool the document has. `toolCommand()` is for a plugin whose tool gets a
 * command of its own, with a shortcut or a permission. Each framework's
 * `/interaction` has the list ready as `interactionCommands`. The i18n plugin
 * has their labels.
 */
import type { CommandContext, CommandDefinition, CommandFamily } from '@embedpdf/core';

import { InteractionToken, type Tool } from './contract';

const interactionOf = (context: CommandContext) => context.tryGet(InteractionToken);

/** The ids of a tool list, made once per list, which keeps its identity while the tools don't change. */
const toolIds = new WeakMap<readonly Tool[], readonly string[]>();
const idsOf = (tools: readonly Tool[]): readonly string[] => {
  let ids = toolIds.get(tools);
  if (!ids) {
    ids = tools.map((tool) => tool.id);
    toolIds.set(tools, ids);
  }
  return ids;
};

/** Switching to a tool: active while it's the tool, there only when the document has it. */
export const toolCommand = (toolId: string): Omit<CommandDefinition, 'id' | 'shortcut'> => ({
  labelKey: `commands.tool.${toolId}`,
  label: toolId,
  icon: toolId,
  categories: ['tool'],
  run: (context) => interactionOf(context)?.activateTool(toolId),
  active: (context) => interactionOf(context)?.getActiveToolId() === toolId,
  visible: (context) => interactionOf(context)?.hasTool(toolId) ?? false,
  // The tool says whether the user may use it: one that draws annotations needs permission to.
  enabled: (context) => interactionOf(context)?.canUseTool(toolId) ?? true,
});

/** `tool:<id>` for every tool the document has. */
const toolCommands: CommandFamily = {
  prefix: 'tool:',
  names: (context) => {
    const interaction = interactionOf(context);
    return interaction ? idsOf(interaction.listTools()) : [];
  },
  command: toolCommand,
};

/** The tool commands: `tool:pointer`, `tool:pan`, `tool:zoom`, and `tool:<id>` for every other tool. */
export function createInteractionCommands(): readonly (CommandDefinition | CommandFamily)[] {
  return [
    // The built-in tools have Acrobat's single keys; the family covers every other.
    { ...toolCommand('pointer'), id: 'tool:pointer', shortcut: 'V' },
    { ...toolCommand('pan'), id: 'tool:pan', shortcut: 'H' },
    { ...toolCommand('zoom'), id: 'tool:zoom', shortcut: 'Z' },
    toolCommands,
  ];
}
