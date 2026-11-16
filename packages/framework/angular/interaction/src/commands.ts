import { createInteractionCommands } from '@embedpdf/plugin-interaction/commands';

/** The tool commands: `tool:pointer`, `tool:pan`, `tool:zoom`, and `tool:<id>` for every other tool. */
export const interactionCommands = /* @__PURE__ */ createInteractionCommands();

// The command behind `tool:<id>`, to build a tool's own command on.
export { toolCommand } from '@embedpdf/plugin-interaction/commands';
