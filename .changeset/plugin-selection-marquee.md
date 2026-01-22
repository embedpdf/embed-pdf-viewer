---
'@embedpdf/plugin-selection': minor
---

Added marquee selection functionality allowing users to drag a rectangle to select multiple elements. Introduced `createMarqueeSelectionHandler` and `createTextSelectionHandler` as separate pointer event handlers that can be combined with `mergeHandlers`. Added `MarqueeSelection` component for Preact, Svelte, and Vue. Added `EnableForModeOptions` interface with `showRects` option for configurable selection behavior. Added `onMarqueeChange` and `onMarqueeEnd` events. Added `setMarqueeEnabled` and `isMarqueeEnabled` methods to the capability.
