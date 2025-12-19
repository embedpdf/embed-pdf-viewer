---
'@embedpdf/plugin-zoom': major
---

## ZoomGestureWrapper (formerly PinchWrapper)

Renamed `PinchWrapper` to `ZoomGestureWrapper` and added wheel zoom support alongside pinch-to-zoom.

### Breaking Changes

- **Renamed Component**: `PinchWrapper` → `ZoomGestureWrapper`
- **Renamed Hook**: `usePinch` → `useZoomGesture`
- **Removed Hammer.js dependency**: Gesture handling is now implemented natively

### New Features

- **Wheel zoom**: Ctrl/Cmd + scroll wheel now zooms the document
- **Configurable gestures**: New props to enable/disable individual gesture types:
  - `enablePinch` (default: `true`) - Enable/disable pinch-to-zoom
  - `enableWheel` (default: `true`) - Enable/disable wheel zoom
- **Improved performance**: Uses `useLayoutEffect` to prevent flashing during zoom operations
- **Simplified internals**: Uses direct DOM measurements instead of plugin metrics

### Migration

```diff
- import { PinchWrapper } from '@embedpdf/plugin-zoom/react';
+ import { ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react';

- <PinchWrapper documentId={documentId}>
+ <ZoomGestureWrapper documentId={documentId}>
    <Scroller ... />
- </PinchWrapper>
+ </ZoomGestureWrapper>
```

To disable a specific gesture:

```tsx
<ZoomGestureWrapper
  documentId={documentId}
  enablePinch={false}  // Disable pinch-to-zoom
  enableWheel={true}   // Keep wheel zoom
>
```
