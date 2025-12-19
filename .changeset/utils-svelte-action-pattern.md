---
'@embedpdf/utils': patch
---

Refactored `CounterRotateContainer` to use a Svelte action (`action: Action<HTMLElement>`) instead of a ref callback (`ref: (el: HTMLElement | null) => void`). This is the idiomatic Svelte pattern for attaching lifecycle-managed behavior to DOM elements. Updated `MenuWrapperProps` type accordingly.

**Migration:**

```svelte
<!-- Before -->
<span bind:this={el} style={menuWrapperProps.style}>
$effect(() => { menuWrapperProps.ref(el); });

<!-- After -->
<span use:menuWrapperProps.action style={menuWrapperProps.style}>
```
