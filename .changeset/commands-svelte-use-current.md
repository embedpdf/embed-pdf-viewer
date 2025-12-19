---
'@embedpdf/plugin-commands': patch
---

Updated `useCommand` hook to return `{ current: ResolvedCommand | null }` instead of `{ command: ResolvedCommand | null }` for consistency with other Svelte hooks. Updated `KeyboardShortcuts` component to use the new pattern.

**Migration:**

```svelte
<!-- Before -->
const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.command?.execute()

<!-- After -->
const cmd = useCommand(() => 'nav.next', () => documentId); // Access: cmd.current?.execute()
```
