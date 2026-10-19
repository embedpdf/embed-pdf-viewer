---
'@embedpdf/plugin-commands': minor
---

The commands plugin now follows the 3.0 public contract: `registerCommand` / `registerCommands` return removers (`unregister` is gone; duplicates throw `conflict` unless `replace`), `hasCommand` / `getCommand` / `listCommandIds` / `resolveCommand` / `listCommands` / `searchCommands` / `listShortcuts` replace `has` / `ids` / `resolve` / `search`, `execute(id, { documentId, args })` returns a promise of an `ExecuteResult`, `canExecute` is new, `getDisabledCategories` replaces `disabledCategories`, and `onExecuted` / `onExecutionFailed` are event hooks. `CommandCtx` is `CommandContext` (with `args`); `run` may be async. `matchStroke` and `getMenuTarget` (was `menuTarget`) live on `@embedpdf/plugin-commands/contract/host`.
