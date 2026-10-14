---
'@embedpdf/plugin-commands': minor
---

The commands are settings: `commandsPlugin({ commands, disabledCategories })` registers them, and `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged` change them while the app runs; `disableCategory()` and its siblings change the `disabledCategories` setting. A command takes a plain `label`, or a `labelKey` for a translated one (the `label` then shows when no language has the key). `execute(id, { documentId, args, signal })` takes a signal, which rejects `operation-cancelled` and reaches `run` as `context.signal`. A command family (`{ prefix, names, command }`) makes one command per name, such as `tool:<id>` for every tool a document has. The new `@embedpdf/plugin-commands/standard` entry has the commands every viewer has: zoom, pages, view rotation, `tool:<id>`, copy, delete, download and print, with shortcuts.
