---
'@embedpdf/plugin-viewport': minor
---

## Viewport Element Context

Added a React context to share the viewport DOM element reference with child components.

### New Features

- **ViewportElementContext**: New context that provides access to the viewport container element
- **useViewportElement hook**: Hook to consume the viewport element reference from context

This allows child components (like `ZoomGestureWrapper`) to access the viewport container element without DOM traversal, enabling gesture events to work anywhere within the viewport area.

### Usage

```tsx
import { useViewportElement } from '@embedpdf/plugin-viewport/react';

function MyComponent() {
  const viewportRef = useViewportElement();
  // viewportRef.current is the viewport container element
}
```
