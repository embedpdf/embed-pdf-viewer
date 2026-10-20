# @embedpdf/plugin-interaction

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rewritten on the kernel's `create()` controller hook with a public contract (`/contract`) and a host lens (`/contract/host`). Public: `getActiveTool`, `getActiveToolId`, `getDefaultToolId`, `listTools`, `getTool`, `hasTool`, `activeToolEnables`, `activateTool`, `activateDefaultTool`, `pushTool`/`popTool`, `setToolCursor`, `registerTool(tool, { replace })`, and the `onToolChanged` event hook. Host (`InteractionHostCapability`): `dispatchPointer` (was `dispatch`), `wouldClaimTouch`, `registerHandler`, `claimCursor` (was `setCursor`), `getCursor`. Removed: `activeTool()`, `activeToolId()`, `tools()`, `cursor()`, `onToolChange`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A tool of your own handles the pointer itself: `registerTool({ id, cursor, touch, onPointerDown, onPointerMove, onPointerUp, onHover })`. `onPointerDown` gets a press on a page in page coordinates (`page`, `point`, `modifiers`, `pointerType`) and returns `true` to take the gesture; its moves and release then follow on the page it started on, even past the page's edge, and a cancelled gesture ends with `onPointerUp` too. `onHover` gets the pointer over a page with no button pressed. The methods act only while the tool is active, and go with the tool.

  `touch: 'draw' | 'tap'` replaces `touchDirect`: `'draw'` lets one finger drive the tool while two fingers scroll and zoom, and `'tap'` (the default) makes a tap a click and a drag scroll.

  The plugin has live settings: `defaultTool` and `tools`, with `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`. `interactionPlugin(config)` registers them over `INTERACTION_DEFAULTS` (`InteractionConfig` is `DeepPartial<InteractionSettings>`); `getDefaultToolId()` and `activateDefaultTool()` read `defaultTool`, and changing `tools` swaps the tools it registered for the new list. `interactionState` declares the state for every framework: `activeToolId` (`null` without a document) and `tools`.

  Events carry only what the docs list: `onToolChanged` carries `toolId` and `previousToolId`, and `activateTool()` and `pushTool()` no longer take a payload. `onGestureStarted`, `onGestureEnded` and `onGestureCancelled` carry `toolId`, `page` and `pointerType` (`GestureStartedEvent`, `GestureEndedEvent`, `GestureCancelledEvent`) instead of the handler's id; `page` is where the gesture began. `setToolCursor(id, cursors)` takes `ToolCursors` (was `ToolCursorSkin`).

  The public `Tool` has no behavior tags. Plugins read and register them through the host contract: `HostTool` (`enables`, `gapCursor`), `activeToolEnables()`, and `InteractionHandler`, `PointerSample` and `samplePointOn`, which moved from `/contract` to `/contract/host`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `PointerSample.page.ref` identifies the page under the pointer; `project(page)` and `samplePointOn(sample, page)` take a `PageRef`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `hasCursorClaim()` on the host lens tells a handler whether a hover claim holds the cursor, so a create handler knows whether a click would reach it.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Keep tool registration, pointer capture, and tool-change events reactive under
  the updated plugin state model. Pointer samples now project to durable page
  references for page-scoped gestures.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for interaction and platform-feedback tokens, pointer/tool protocols, and capability types without either plugin implementation.

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add pointer modality, cancellation, long-press, source metadata, touch-claim preflight, and source-scoped handlers to interaction routing. Introduce the PlatformFeedback capability and feedback plugin, and add a missing-plugin hint to the interaction capability token.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the framework-independent interaction hub. It coordinates the active tool, cursor, pointer routing, and contributed handlers without embedding feature-specific knowledge about annotations, selection, forms, or links.
