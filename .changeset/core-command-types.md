---
'@embedpdf/core': minor
---

`CommandDefinition`, `CommandFamily`, `CommandContext` and `IconAccent` are core types now, so a plugin can ship commands without depending on the commands plugin, which still exports them. `@embedpdf/core/commands` has `createDocumentCommands()`: download and print, which take the browser's file download as an argument. `@embedpdf/core/testing` gains `createTestCommandContext()`, a command context over stand-in capabilities for testing a plugin's commands.
