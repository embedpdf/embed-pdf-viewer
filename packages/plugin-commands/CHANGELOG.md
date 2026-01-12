# @embedpdf/plugin-commands

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The commands plugin now supports command registration and execution with document awareness.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support command registration, execution tracking, and state management.
  - **Command Execution**: Commands now receive document context and can be scoped to specific documents.
  - **State Management**: Plugin now maintains command registration state and tracks command execution events.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **useCommand Hook**:
    - Now requires `documentId` parameter: `useCommand(commandId, documentId)` (React/Preact: `@embedpdf/plugin-commands/react`, Svelte: `@embedpdf/plugin-commands/svelte`, Vue: `@embedpdf/plugin-commands/vue`)
    - Returns document-scoped resolved command
  - **KeyboardShortcuts Component**:
    - New component for setting up keyboard shortcuts globally
    - Automatically handles command execution with document context

  ### New Features
  - Command registration and unregistration system
  - Command execution event tracking
  - Command state change notifications
  - Document-aware command execution
  - Integration with i18n plugin for command translations

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Updated `useCommand` hook to return `{ current: ResolvedCommand | null }` instead of `{ command: ResolvedCommand | null }` for consistency with other Svelte hooks. Updated `KeyboardShortcuts` component to use the new pattern.

  **Migration:**

  ```svelte
  <!-- Before -->
  const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.command?.execute()

  <!-- After -->
  const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.current?.execute()
  ```

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

### Patch Changes

- [`caec11d`](https://github.com/embedpdf/embed-pdf-viewer/commit/caec11d7e8b925e641b4834aadf9a126edfb3586) by [@bobsingor](https://github.com/bobsingor) – Updated `useCommand` hook to return `{ current: ResolvedCommand | null }` instead of `{ command: ResolvedCommand | null }` for consistency with other Svelte hooks. Updated `KeyboardShortcuts` component to use the new pattern.

  **Migration:**

  ```svelte
  <!-- Before -->
  const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.command?.execute()

  <!-- After -->
  const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.current?.execute()
  ```

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The commands plugin now supports command registration and execution with document awareness.

  ### Breaking Changes
  - **Plugin Architecture**: Complete rewrite to support command registration, execution tracking, and state management.
  - **Command Execution**: Commands now receive document context and can be scoped to specific documents.
  - **State Management**: Plugin now maintains command registration state and tracks command execution events.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **useCommand Hook**:
    - Now requires `documentId` parameter: `useCommand(commandId, documentId)` (React/Preact: `@embedpdf/plugin-commands/react`, Svelte: `@embedpdf/plugin-commands/svelte`, Vue: `@embedpdf/plugin-commands/vue`)
    - Returns document-scoped resolved command
  - **KeyboardShortcuts Component**:
    - New component for setting up keyboard shortcuts globally
    - Automatically handles command execution with document context

  ### New Features
  - Command registration and unregistration system
  - Command execution event tracking
  - Command state change notifications
  - Document-aware command execution
  - Integration with i18n plugin for command translations
