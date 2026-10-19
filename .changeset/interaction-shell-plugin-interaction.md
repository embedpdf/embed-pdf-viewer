---
'@embedpdf/plugin-interaction': minor
---

A tool of your own handles the pointer itself: `registerTool({ id, cursor, touch, onPointerDown, onPointerMove, onPointerUp, onHover })`. `onPointerDown` gets a press on a page in page coordinates (`page`, `point`, `modifiers`, `pointerType`) and returns `true` to take the gesture; its moves and release then follow on the page it started on, even past the page's edge, and a cancelled gesture ends with `onPointerUp` too. `onHover` gets the pointer over a page with no button pressed. The methods act only while the tool is active, and go with the tool.

`touch: 'draw' | 'tap'` replaces `touchDirect`: `'draw'` lets one finger drive the tool while two fingers scroll and zoom, and `'tap'` (the default) makes a tap a click and a drag scroll.

The plugin has live settings: `defaultTool` and `tools`, with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `interactionPlugin(config)` registers them over `INTERACTION_DEFAULTS` (`InteractionConfig` is `DeepPartial<InteractionSettings>`); `getDefaultToolId()` and `activateDefaultTool()` read `defaultTool`, and changing `tools` swaps the tools it registered for the new list. `interactionState` declares the state for every framework: `activeToolId` (`null` without a document) and `tools`.

Events carry only what the docs list: `onToolChanged` carries `toolId` and `previousToolId`, and `activateTool()` and `pushTool()` no longer take a payload. `onGestureStarted`, `onGestureEnded` and `onGestureCancelled` carry `toolId`, `page` and `pointerType` (`GestureStartedEvent`, `GestureEndedEvent`, `GestureCancelledEvent`) instead of the handler's id; `page` is where the gesture began. `setToolCursor(id, cursors)` takes `ToolCursors` (was `ToolCursorSkin`).

The public `Tool` has no behavior tags. Plugins read and register them through the host contract: `HostTool` (`enables`, `gapCursor`), `activeToolEnables()`, and `InteractionHandler`, `PointerSample` and `samplePointOn`, which moved from `/contract` to `/contract/host`.
