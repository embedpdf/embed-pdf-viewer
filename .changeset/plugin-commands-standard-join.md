---
'@embedpdf/plugin-commands': minor
---

`createStandardCommands()` in `@embedpdf/plugin-commands/standard` is deprecated. It keeps returning the commands it had in 3.2, now joined from the lists their plugins ship (`createStageCommands()` in `@embedpdf/plugin-stage/commands`, and so on), and nothing new joins it. Spread your framework package's `standardCommands`, or the lists you need. The command types (`CommandDefinition`, `CommandFamily`, `CommandContext`, `IconAccent`) are re-exported from `@embedpdf/core`, where they live now.
