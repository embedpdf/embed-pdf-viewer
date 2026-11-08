# @embedpdf/plugin-commands

## 3.1.0

### Patch Changes

- [#1029](https://github.com/embedpdf/embed-pdf-viewer/pull/1029) by [@bobsingor](https://github.com/bobsingor) – A command's `enabled`, `active`, `visible`, `labelParams`, `iconAccent`, `allowed` and `locked` are
  asked once per store change, however many toolbars, menus and strips show the command, and its
  label and disabled reason are translated again only when one of their answers changed. Scrolling
  and zooming a long document no longer spends a fifth of its time asking every command again.

  `resolveCommand` and `listCommands` follow every change the viewer knows of: the viewer's own
  state, your app's state given through `appState`, and a command that ran. `execute` and
  `canExecute` ask the command at the moment they're called, so a run never goes by an answer that
  something outside the viewer changed since.

## 3.0.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the command registry used as the viewer's shared vocabulary of actions. Commands derive reactive labels, icons, enabled state, visibility, and active state from capabilities so toolbars, menus, and shortcuts use one source of truth.

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – Commands read your app's state. The new `appState` setting is what every command's functions get as `appState` (values, and functions that change them); a new value replaces the old one whole and every command's `enabled`, `active` and `visible` are asked again. After a command runs, every command is asked again too, so a button whose `run` changed state outside the viewer shows it at once. `CommandDef<AppState>`, `CommandContext<AppState>` and `commandsPlugin<AppState>()` type it; a command's functions are methods, so a typed command goes wherever a command does.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Command definitions can resolve any capability again in development builds (the dependency guard no longer hides siblings from `enabled`, `visible` and `run`). `CommandContext.core()` is removed; read the document registry with `get(DocumentsToken)`.

- [#1006](https://github.com/embedpdf/embed-pdf-viewer/pull/1006) by [@bobsingor](https://github.com/bobsingor) – A command can have `labelParams(context)`: the values for its label's `{name}` slots, such as how many pages are selected. It's asked like `enabled`, again whenever the viewer's state or your app's changes. The values go into `label`, into the translated words under `labelKey` or the command's id, where a number `count` picks the plural form, and into every sentence that names the label. A `labelParams` that throws gives no values. Without the i18n plugin, `label`'s slots are filled too.

- [#1013](https://github.com/embedpdf/embed-pdf-viewer/pull/1013) by [@bobsingor](https://github.com/bobsingor) – A resolved command says whether it's a toggle: `pressable` is true when the command has an `active` of its own or opens a panel, and false for a command that runs an action, opens a menu or opens a dialog. A toggle's button says `aria-pressed`, true or false, and other buttons leave it off, so a screen reader announces only toggles as toggles. `resolvedCommandsEqual` compares it too, and an unregistered command isn't one.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The commands are settings: `commandsPlugin({ commands, disabledCategories })` registers them, and `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged` change them while the app runs; `disableCategory()` and its siblings change the `disabledCategories` setting. A command takes a plain `label`, or a `labelKey` for a translated one (the `label` then shows when no language has the key). `execute(id, { documentId, args, signal })` takes a signal, which rejects `operation-cancelled` and reaches `run` as `context.signal`. A command family (`{ prefix, names, command }`) makes one command per name, such as `tool:<id>` for every tool a document has. The new `@embedpdf/plugin-commands/standard` entry has the commands every viewer has: zoom, pages, view rotation, `tool:<id>`, copy, delete, download and print, with shortcuts.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The commands plugin now follows the 3.0 public contract: `registerCommand` / `registerCommands` return removers (`unregister` is gone; duplicates throw `conflict` unless `replace`), `hasCommand` / `getCommand` / `listCommandIds` / `resolveCommand` / `listCommands` / `searchCommands` / `listShortcuts` replace `has` / `ids` / `resolve` / `search`, `execute(id, { documentId, args })` returns a promise of an `ExecuteResult`, `canExecute` is new, `getDisabledCategories` replaces `disabledCategories`, and `onExecuted` / `onExecutionFailed` are event hooks. `CommandCtx` is `CommandContext` (with `args`); `run` may be async. `matchStroke` and `getMenuTarget` (was `menuTarget`) live on `@embedpdf/plugin-commands/contract/host`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command's `panel` takes `focus`: `panel: { id: 'search', focus: true }` opens the panel asking for the cursor, as `shell.open(id, { focus: true })` does. `shortcutInTextFields: true` lets a command's shortcut run while the cursor is in a text field where the shortcuts listen (a Find that should work from the search box too); `matchStroke(stroke, { isMac, inTextField })` then matches only such commands.

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – The standard commands have `tool:zoom`, the marquee zoom tool, on `Z` (Acrobat's key), next to `tool:pointer` (`V`) and `tool:pan` (`H`).

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for command tokens, definitions, resolved-command equality, and capability types without command plugin wiring.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `document:print` prints the document in scope through the kernel's `documents.print()`, which runs the document's own print actions around the dialog. `StandardCommandsPlatform` no longer has `print`, and the package no longer depends on `@embedpdf/plugin-actions`.

- [#933](https://github.com/embedpdf/embed-pdf-viewer/pull/933) by [@bobsingor](https://github.com/bobsingor) – A command that changes a setting can say so with `locked: (context) => owner.getLock(key)`. While a lock holds that setting, the command shows disabled, whatever the `notAllowed` setting says, stays `active` for its own value, and gives the lock's sentence (its `reasonKey`, else `commands.locked.default`) as `disabledReason`. `getRefusal()` reports it with a third reason, `'locked'`, and `execute()` refuses it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Commands follow the document in scope. Resolved for a document, such as inside a `<DocumentScope>` or through `ctx.forDocument()`, `execute()`, `canExecute()`, `resolveCommand()`, `listCommands()` and `searchCommands()` act on that document when the call leaves the document out. Outside a scope they act on the active document, and a document named in the call always wins.

- [#980](https://github.com/embedpdf/embed-pdf-viewer/pull/980) by [@bobsingor](https://github.com/bobsingor) – New standard commands: `tool:snapshot`, not allowed without `doc.content.copy` (`commands.notAllowed.doc-content-copy`); `snapshot:copy` (`Mod+C`), `snapshot:save` (a PNG named after the document and the page) and `snapshot:clear` (`Escape`), each enabled while there is a snapshot. `StandardCommandsPlatform` has `copyImage(image)`, and `saveFile` takes the file's content type. Commands that share a key take turns: a key runs the one that can run now, wherever it is in the list, so Escape lets a snapshot go even though cancelling a drawing has Escape too.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – `CommandDefinition` replaces `CommandDef`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `unregisteredCommand(id)`, what a component or a toolbar draws for an id no plugin registered, is neither visible nor enabled, the way a turned-off command is. `unknownCommandWarning(id, known)` is the development warning for it, with the closest id there is. `resolveCommand(id)` still says `null` for an unknown id.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command says which scope permissions it needs with `requires` (`['doc.print']`), checked against its document: without them it's hidden, or, with the new `notAllowed: 'disable'` setting, shown disabled with a translated `disabledReason` on the resolved command. Turning off a category now turns off every category under it, on whole dotted parts (`annotations` turns off `annotations.highlight`). Single commands turn off next to categories: the `disabledCommands` setting and `disableCommand`, `enableCommand`, `setDisabledCommands`, `getDisabledCommands` and `isCommandDisabled`; a turned-off command is hidden and refused by `execute()`. On the host lens, `matchStroke` returns `{ commandId, refusal }`, where `refusal` (`CommandRefusal`: `'turned-off'` or `'not-allowed'`, with a message) says why a command won't run, and of several commands with the same keys one that may run wins. The standard `document:download` and `document:print` say what they need with `requires`.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – A command's `enabled`, `active` or `visible` that throws now counts as `false`, so its button shows disabled, not pressed, or hidden; only a command without one takes the default (enabled, not active, visible). `allowed` keeps its own rule.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – A bound command's formatted shortcut is `shortcutLabel`; `shortcut` stays the key a command definition takes.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command can say whether the session may run it with `allowed`, a function that reads the plugins' `can*` checks (`documents.canPrint()`), and `notAllowedKey`, the translation key of the sentence that says why not. When `allowed` says no, the command is not allowed, as with `requires`: hidden, or disabled with its `disabledReason` under `notAllowed: 'disable'`, and its shortcut refused with that sentence. It's asked only while a document is open; one that throws allows the command. The standard `document:download` and `document:print` commands read `documents.canDownload()` and `documents.canPrint()` this way.

  `getRefusal(id, documentId?)` says why a command won't run whatever the moment: turned off, or not allowed for its document, with the sentence for the user; `null` when it may run, for a keyboard help sheet that lists only the keys that work.

  A refused command takes its keys only while its `visible` says it would show: Delete with nothing selected stays the page's, even where deleting is turned off.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command's label is a language's string under the command's id first, then under its `labelKey`, in the current language and then in the fallback one, then `label`, then the id. So `addTranslations('nl', { 'document:download': 'Kopie opslaan' })` relabels that one command in Dutch whichever key its label is under, and a command with only a `label` can be translated by its id. A command with a `labelKey` that no language has now shows its id rather than the key.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The standard annotation commands use the annotation plugin's `tools`, `selection.list()` and `selection.delete()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `boundCommandOf(command, execute, { isMac })`, a resolved command with `run` and its first shortcut formatted for the platform (the `BoundCommand` type moves here from the framework adapters, unchanged), and `unregisteredCommand(id)`, what a toolbar draws for an id no plugin registered.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Declare the optional i18n and shell dependencies, and create the command registry per kernel instance instead of in the plugin definition, so one definition installed in two viewers no longer shares commands.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The standard `annotation:delete` command is enabled only when every selected annotation may be deleted and the annotation plugin's `editable` setting lets people change it.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – The standard `zoom:in` and `zoom:out` commands are off at the Stage's `maxZoom` and `minZoom`.

## 3.0.0-next.23

### Minor Changes

- [#1006](https://github.com/embedpdf/embed-pdf-viewer/pull/1006) by [@bobsingor](https://github.com/bobsingor) – A command can have `labelParams(context)`: the values for its label's `{name}` slots, such as how many pages are selected. It's asked like `enabled`, again whenever the viewer's state or your app's changes. The values go into `label`, into the translated words under `labelKey` or the command's id, where a number `count` picks the plural form, and into every sentence that names the label. A `labelParams` that throws gives no values. Without the i18n plugin, `label`'s slots are filled too.

- [#1003](https://github.com/embedpdf/embed-pdf-viewer/pull/1003) by [@bobsingor](https://github.com/bobsingor) – `CommandDefinition` replaces `CommandDef`.

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – A bound command's formatted shortcut is `shortcutLabel`; `shortcut` stays the key a command definition takes.

## 3.0.0-next.22

### Minor Changes

- [#980](https://github.com/embedpdf/embed-pdf-viewer/pull/980) by [@bobsingor](https://github.com/bobsingor) – New standard commands: `tool:snapshot`, not allowed without `doc.content.copy` (`commands.notAllowed.doc-content-copy`); `snapshot:copy` (`Mod+C`), `snapshot:save` (a PNG named after the document and the page) and `snapshot:clear` (`Escape`), each enabled while there is a snapshot. `StandardCommandsPlatform` has `copyImage(image)`, and `saveFile` takes the file's content type. Commands that share a key take turns: a key runs the one that can run now, wherever it is in the list, so Escape lets a snapshot go even though cancelling a drawing has Escape too.

## 3.0.0-next.21

## 3.0.0-next.20

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – Commands read your app's state. The new `appState` setting is what every command's functions get as `appState` (values, and functions that change them); a new value replaces the old one whole and every command's `enabled`, `active` and `visible` are asked again. After a command runs, every command is asked again too, so a button whose `run` changed state outside the viewer shows it at once. `CommandDef<AppState>`, `CommandContext<AppState>` and `commandsPlugin<AppState>()` type it; a command's functions are methods, so a typed command goes wherever a command does.

- [#933](https://github.com/embedpdf/embed-pdf-viewer/pull/933) by [@bobsingor](https://github.com/bobsingor) – A command that changes a setting can say so with `locked: (context) => owner.getLock(key)`. While a lock holds that setting, the command shows disabled, whatever the `notAllowed` setting says, stays `active` for its own value, and gives the lock's sentence (its `reasonKey`, else `commands.locked.default`) as `disabledReason`. `getRefusal()` reports it with a third reason, `'locked'`, and `execute()` refuses it.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – A command's `enabled`, `active` or `visible` that throws now counts as `false`, so its button shows disabled, not pressed, or hidden; only a command without one takes the default (enabled, not active, visible). `allowed` keeps its own rule.

## 3.0.0-next.19

### Minor Changes

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – The standard commands have `tool:zoom`, the marquee zoom tool, on `Z` (Acrobat's key), next to `tool:pointer` (`V`) and `tool:pan` (`H`).

### Patch Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – The standard `zoom:in` and `zoom:out` commands are off at the Stage's `maxZoom` and `minZoom`.

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `document:print` prints the document in scope through the kernel's `documents.print()`, which runs the document's own print actions around the dialog. `StandardCommandsPlatform` no longer has `print`, and the package no longer depends on `@embedpdf/plugin-actions`.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Command definitions can resolve any capability again in development builds (the dependency guard no longer hides siblings from `enabled`, `visible` and `run`). `CommandContext.core()` is removed; read the document registry with `get(DocumentsToken)`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The commands are settings: `commandsPlugin({ commands, disabledCategories })` registers them, and `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged` change them while the app runs; `disableCategory()` and its siblings change the `disabledCategories` setting. A command takes a plain `label`, or a `labelKey` for a translated one (the `label` then shows when no language has the key). `execute(id, { documentId, args, signal })` takes a signal, which rejects `operation-cancelled` and reaches `run` as `context.signal`. A command family (`{ prefix, names, command }`) makes one command per name, such as `tool:<id>` for every tool a document has. The new `@embedpdf/plugin-commands/standard` entry has the commands every viewer has: zoom, pages, view rotation, `tool:<id>`, copy, delete, download and print, with shortcuts.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The commands plugin now follows the 3.0 public contract: `registerCommand` / `registerCommands` return removers (`unregister` is gone; duplicates throw `conflict` unless `replace`), `hasCommand` / `getCommand` / `listCommandIds` / `resolveCommand` / `listCommands` / `searchCommands` / `listShortcuts` replace `has` / `ids` / `resolve` / `search`, `execute(id, { documentId, args })` returns a promise of an `ExecuteResult`, `canExecute` is new, `getDisabledCategories` replaces `disabledCategories`, and `onExecuted` / `onExecutionFailed` are event hooks. `CommandCtx` is `CommandContext` (with `args`); `run` may be async. `matchStroke` and `getMenuTarget` (was `menuTarget`) live on `@embedpdf/plugin-commands/contract/host`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command's `panel` takes `focus`: `panel: { id: 'search', focus: true }` opens the panel asking for the cursor, as `shell.open(id, { focus: true })` does. `shortcutInTextFields: true` lets a command's shortcut run while the cursor is in a text field where the shortcuts listen (a Find that should work from the search box too); `matchStroke(stroke, { isMac, inTextField })` then matches only such commands.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Commands follow the document in scope. Resolved for a document, such as inside a `<DocumentScope>` or through `ctx.forDocument()`, `execute()`, `canExecute()`, `resolveCommand()`, `listCommands()` and `searchCommands()` act on that document when the call leaves the document out. Outside a scope they act on the active document, and a document named in the call always wins.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `unregisteredCommand(id)`, what a component or a toolbar draws for an id no plugin registered, is neither visible nor enabled, the way a turned-off command is. `unknownCommandWarning(id, known)` is the development warning for it, with the closest id there is. `resolveCommand(id)` still says `null` for an unknown id.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command says which scope permissions it needs with `requires` (`['doc.print']`), checked against its document: without them it's hidden, or, with the new `notAllowed: 'disable'` setting, shown disabled with a translated `disabledReason` on the resolved command. Turning off a category now turns off every category under it, on whole dotted parts (`annotations` turns off `annotations.highlight`). Single commands turn off next to categories: the `disabledCommands` setting and `disableCommand`, `enableCommand`, `setDisabledCommands`, `getDisabledCommands` and `isCommandDisabled`; a turned-off command is hidden and refused by `execute()`. On the host lens, `matchStroke` returns `{ commandId, refusal }`, where `refusal` (`CommandRefusal`: `'turned-off'` or `'not-allowed'`, with a message) says why a command won't run, and of several commands with the same keys one that may run wins. The standard `document:download` and `document:print` say what they need with `requires`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command can say whether the session may run it with `allowed`, a function that reads the plugins' `can*` checks (`documents.canPrint()`), and `notAllowedKey`, the translation key of the sentence that says why not. When `allowed` says no, the command is not allowed, as with `requires`: hidden, or disabled with its `disabledReason` under `notAllowed: 'disable'`, and its shortcut refused with that sentence. It's asked only while a document is open; one that throws allows the command. The standard `document:download` and `document:print` commands read `documents.canDownload()` and `documents.canPrint()` this way.

  `getRefusal(id, documentId?)` says why a command won't run whatever the moment: turned off, or not allowed for its document, with the sentence for the user; `null` when it may run, for a keyboard help sheet that lists only the keys that work.

  A refused command takes its keys only while its `visible` says it would show: Delete with nothing selected stays the page's, even where deleting is turned off.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A command's label is a language's string under the command's id first, then under its `labelKey`, in the current language and then in the fallback one, then `label`, then the id. So `addTranslations('nl', { 'document:download': 'Kopie opslaan' })` relabels that one command in Dutch whichever key its label is under, and a command with only a `label` can be translated by its id. A command with a `labelKey` that no language has now shows its id rather than the key.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The standard annotation commands use the annotation plugin's `tools`, `selection.list()` and `selection.delete()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `boundCommandOf(command, execute, { isMac })`, a resolved command with `run` and its first shortcut formatted for the platform (the `BoundCommand` type moves here from the framework adapters, unchanged), and `unregisteredCommand(id)`, what a toolbar draws for an id no plugin registered.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Declare the optional i18n and shell dependencies, and create the command registry per kernel instance instead of in the plugin definition, so one definition installed in two viewers no longer shares commands.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The standard `annotation:delete` command is enabled only when every selected annotation may be deleted and the annotation plugin's `editable` setting lets people change it.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for command tokens, definitions, resolved-command equality, and capability types without command plugin wiring.

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the command registry used as the viewer's shared vocabulary of actions. Commands derive reactive labels, icons, enabled state, visibility, and active state from capabilities so toolbars, menus, and shortcuts use one source of truth.
