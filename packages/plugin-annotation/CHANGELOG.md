# @embedpdf/plugin-annotation

## 2.14.0

### Minor Changes

- [#581](https://github.com/embedpdf/embed-pdf-viewer/pull/581) by [@bobsingor](https://github.com/bobsingor) – Add callout free text (`FreeTextCallout`): creation handler and preview data, vertex config and patch pipeline, default `freeTextCallout` tool, and built-in renderers for React, Vue, and Svelte (including preview components and shared `calloutVertexConfig`).

## 2.13.0

### Patch Changes

- [#579](https://github.com/embedpdf/embed-pdf-viewer/pull/579) by [@bobsingor](https://github.com/bobsingor) – Re-export patching utilities from `./patching` so dependent plugins (for example signature placement) can reuse the shared patch helpers.

## 2.12.1

### Patch Changes

- [#571](https://github.com/embedpdf/embed-pdf-viewer/pull/571) by [@bobsingor](https://github.com/bobsingor) – Add `getAnnotations(options?)` method to retrieve all tracked annotations, optionally filtered by page index. Available on both `AnnotationCapability` and `AnnotationScope`.

## 2.12.0

### Minor Changes

- [#569](https://github.com/embedpdf/embed-pdf-viewer/pull/569) by [@bobsingor](https://github.com/bobsingor) – Add symmetric annotation import/export API using a unified `AnnotationTransferItem` type. `exportAnnotations()` produces the same format that `importAnnotations()` consumes — zero remapping needed for round-tripping. Stamp appearances are automatically exported as PDF buffers in `ctx.data`. On import, stamps can be created from PNG, JPEG, or PDF buffers via `ctx: { data: ArrayBuffer }` — the engine auto-detects the format from magic bytes. Also adds `deleteAllAnnotations()` convenience method.

## 2.11.1

### Patch Changes

- [#566](https://github.com/embedpdf/embed-pdf-viewer/pull/566) by [@bobsingor](https://github.com/bobsingor) – Fix Vue and Svelte renderer registration typing so custom preview container styles build correctly.

## 2.11.0

### Minor Changes

- [#562](https://github.com/embedpdf/embed-pdf-viewer/pull/562) by [@bobsingor](https://github.com/bobsingor) – Add `ToolContextMap` to support typed context injection for active tools. Introduce preview renderers and bounding-box components for annotations (`CirclePreview`, `SquarePreview`, `InkPreview`, etc.) to support drag-to-create or stamp hover previews.

## 2.10.1

### Patch Changes

- [#556](https://github.com/embedpdf/embed-pdf-viewer/pull/556) by [@bobsingor](https://github.com/bobsingor) – Fix stamp (and other annotation type) handlers not working for custom tools added via `addTool()`.

  The #537 merge moved handler factory lookup from a centralized subtype-based registry to a `pointerHandler` property on each tool object. Custom tools that didn't specify `pointerHandler` lost their pointer interaction entirely. This restores a default handler registry as a fallback so tools without an explicit `pointerHandler` automatically get the canonical handler for their annotation subtype.

## 2.10.0

### Minor Changes

- [#537](https://github.com/embedpdf/embed-pdf-viewer/pull/537) by [@bobsingor](https://github.com/bobsingor) –
  - Add annotation lock modes, scoped navigation/state events, richer tool metadata, and locked-mode renderer support so annotations can switch cleanly between authoring and fill interactions.
  - Add link previews and locked link navigation support plus shared React, Svelte, and Vue updates for the new renderer and interaction APIs.

## 2.9.1

### Patch Changes

- [#532](https://github.com/embedpdf/embed-pdf-viewer/pull/532) by [@bobsingor](https://github.com/bobsingor) – FreeText annotation improvements:
  - Fix FreeText editing blocked by interaction layer after the visual/interaction layer split. When `isEditing` is true, pointer events now correctly reach the text content in the visual layer while the interaction layer becomes passive.
  - Add `editAfterCreate` tool behavior: FreeText annotations automatically enter editing mode after creation, with the default text fully selected so typing immediately replaces it.
  - Prevent accidental annotation creation when exiting FreeText editing mode by clicking the page background (`stopImmediatePropagation`).
  - Normalize NBSP characters (`\u00A0`) to regular spaces when reading text from contenteditable on blur.
  - Fix Vue FreeText editing initialization timing so `editAfterCreate` works correctly on first mount.

## 2.9.0

### Minor Changes

- [#529](https://github.com/embedpdf/embed-pdf-viewer/pull/529) by [@bobsingor](https://github.com/bobsingor) – Add cloudy border support for Circle, Square, and Polygon annotations across React, Vue, and Svelte renderers. Includes a framework-agnostic SVG path generator (`cloudy-border.ts`), conditional rendering of scalloped `<path>` elements with `stroke-linejoin: round`, cloudy-aware hit areas, rectangle differences computation in handlers and patch functions, and polygon preview support.

### Patch Changes

- [#517](https://github.com/embedpdf/embed-pdf-viewer/pull/517) by [@sebabal](https://github.com/sebabal) – Fix link annotation click not working in the Vue build.

  The template expression `@pointerdown="hasIRT ? undefined : onClick"` compiled to a function that returned the `onClick` reference instead of invoking it. Changed to `onClick?.($event)` so the handler is actually called on pointer down, restoring link selection and navigation. Thanks to @sebabal

- [#530](https://github.com/embedpdf/embed-pdf-viewer/pull/530) by [@bobsingor](https://github.com/bobsingor) – Hide the group selection menu while group rotation is active. Previously the menu remained visible during rotation, which could overlap with rotation guide lines and the tooltip. This aligns the group selection box behavior with the single-annotation container, which already hides its menu during rotation.

- [#512](https://github.com/embedpdf/embed-pdf-viewer/pull/512) by [@bobsingor](https://github.com/bobsingor) – Add smart line recognition to the ink handler with horizontal/vertical axis snapping.

  When `smartLineRecognition` is enabled on an ink tool, straight strokes drawn close to a horizontal or vertical axis are automatically snapped to a clean two-point line after `pointerUp`. The snapped line is centred on the average position of all recorded points rather than being anchored to the start point. Diagonal straight strokes (outside the snap cone) are left untouched with their original points intact.

  New `InkBehavior` fields on `AnnotationTool`:
  - `snapAngleDeg` — degrees from horizontal/vertical within which snapping is applied (default `15`). Strokes whose angle falls outside both snap zones are not reduced to two points.

## 2.8.0

### Minor Changes

- [#509](https://github.com/embedpdf/embed-pdf-viewer/pull/509) by [@bobsingor](https://github.com/bobsingor) – Implement noZoom and noRotate annotation flag rendering. Annotations with noZoom now maintain a constant screen-pixel size regardless of zoom level, and annotations with noRotate stay visually upright regardless of page rotation.

- [#495](https://github.com/embedpdf/embed-pdf-viewer/pull/495) by [@bobsingor](https://github.com/bobsingor) – Added "Insert Text" and "Replace Text" annotation tools.
  Added renderer for Caret annotations.
  Added support for grouped annotations in selectors (e.g. for Replace Text where a Caret and Strikeout are grouped).

- [#509](https://github.com/embedpdf/embed-pdf-viewer/pull/509) by [@bobsingor](https://github.com/bobsingor) – Add Text (comment) annotation tool with handler, tool definition, and renderer support. thanks to @JoackimPennerup

### Patch Changes

- [#502](https://github.com/embedpdf/embed-pdf-viewer/pull/502) by [@danielbayerlein](https://github.com/danielbayerlein) – Add dashed stroke support to Polyline component for React, Vue and Svelte frameworks. Thanks @danielbayerlein!

- [#495](https://github.com/embedpdf/embed-pdf-viewer/pull/495) by [@bobsingor](https://github.com/bobsingor) – Fix markup annotations (highlight, underline, strikethrough) not being created on PDFs that lack `CopyContents` permission. Annotations are now created without extracted text metadata when text extraction is denied.

- [#495](https://github.com/embedpdf/embed-pdf-viewer/pull/495) by [@bobsingor](https://github.com/bobsingor) – Add `isRotatable: false` to text markup annotation tools (highlight, underline, strikeout, squiggly) to explicitly prevent rotation on these text-anchored annotations.

- [#495](https://github.com/embedpdf/embed-pdf-viewer/pull/495) by [@bobsingor](https://github.com/bobsingor) – Fix marquee selection selecting non-rendered annotation types (e.g. POPUP, TEXT, WIDGET). Only annotations with a visual renderer are now included in marquee selection results.

- [#508](https://github.com/embedpdf/embed-pdf-viewer/pull/508) by [@bobsingor](https://github.com/bobsingor) – Fix newly created annotations showing their appearance stream instead of dict-based rendering. New annotations now consistently start with `dictMode: true` across all framework wrappers (React, Vue, Svelte).

- [#509](https://github.com/embedpdf/embed-pdf-viewer/pull/509) by [@bobsingor](https://github.com/bobsingor) – Fix group selection box outline when selected annotations use `noZoom` and/or `noRotate` flags. The multi-select group outline now correctly encloses mixed selections (flagged + normal annotations), including rotated pages and non-square noRotate annotations.

- [#495](https://github.com/embedpdf/embed-pdf-viewer/pull/495) by [@bobsingor](https://github.com/bobsingor) – Remove redundant `onTouchStart` handlers from annotation renderers. `onPointerDown` already covers touch input on all modern browsers, so the duplicate handler caused non-passive event listener violations and double-fired on touch devices.

## 2.7.0

### Minor Changes

- [#467](https://github.com/embedpdf/embed-pdf-viewer/pull/467) by [@bobsingor](https://github.com/bobsingor) –
  - Added support for rendering annotation appearance streams (AP) for better visual fidelity with other PDF viewers.
  - Refactored annotation rendering to use a registry-based system, allowing for easier extensibility.
  - Introduced `moveAnnotation` API to update annotation positions without regenerating their appearance streams.
  - Added caching for rendered appearance streams.

## 2.6.2

## 2.6.1

## 2.6.0

### Minor Changes

- [#447](https://github.com/embedpdf/embed-pdf-viewer/pull/447) by [@bobsingor](https://github.com/bobsingor) – Added `modeId` filtering to marquee end event handler so annotation selection only triggers during `pointerMode`, preventing interference with redaction marquees. Added page activity claims (`annotation-selection` topic) when selecting/deselecting annotations for scroll plugin page elevation.

- [#452](https://github.com/embedpdf/embed-pdf-viewer/pull/452) by [@bobsingor](https://github.com/bobsingor) –
  - Add support for rotating annotations.
  - Add `rotationUI` prop to `AnnotationLayer` and `AnnotationContainer`.
  - Add `isRotatable` and `isGroupRotatable` properties to `AnnotationTool`.
  - Add `insertUpright` behavior for stamps and free text.
  - Update `AnnotationLayer` to support custom rotation handles via slots/components.

### Patch Changes

- [#458](https://github.com/embedpdf/embed-pdf-viewer/pull/458) by [@bobsingor](https://github.com/bobsingor) –
  - Use `standardFontCssProperties` in FreeText components (React, Svelte, Vue) so bold/italic render correctly on all platforms.

## 2.5.0

### Patch Changes

- [#441](https://github.com/embedpdf/embed-pdf-viewer/pull/441) by [@bobsingor](https://github.com/bobsingor) – Fixed rotation calculation in AnnotationLayer components to properly combine page intrinsic rotation with document rotation:
  - Updated React `AnnotationLayer` component to compute effective rotation as `(pageRotation + docRotation) % 4`
  - Updated Vue `annotation-layer.vue` component with the same rotation logic
  - Updated Svelte `AnnotationLayer.svelte` component with the same rotation logic

## 2.4.1

## 2.4.0

### Minor Changes

- [#426](https://github.com/embedpdf/embed-pdf-viewer/pull/426) by [@bobsingor](https://github.com/bobsingor) – Added annotation renderer registry and enhanced annotation capabilities:
  - Added `purgeAnnotation()` method to remove annotations from state without calling the PDF engine
  - Added annotation renderer registry allowing external plugins to register custom annotation renderers
  - Added `useRegisterRenderers()` hook and `AnnotationRendererProvider` context for renderer registration
  - Changed interaction properties (`isDraggable`, `isResizable`, `lockAspectRatio`) to support dynamic functions based on annotation
  - Added `AnnotationCommandMetadata` interface for history command filtering
  - Added `isRedact()` helper function for type-checking redact annotations
  - Framework exports now include `AnnotationPluginPackage` with `AnnotationRendererProvider` wrapper

### Patch Changes

- [#429](https://github.com/embedpdf/embed-pdf-viewer/pull/429) by [@bobsingor](https://github.com/bobsingor) – Fixed group selection box ignoring document permissions:
  - Added `canModifyAnnotations` permission check to `GroupSelectionBox` component across React, Vue, and Svelte
  - Group drag and resize operations are now properly disabled when the user lacks annotation modification permissions
  - This aligns group selection behavior with individual annotation container permission checks

## 2.3.0

### Minor Changes

- [#406](https://github.com/embedpdf/embed-pdf-viewer/pull/406) by [@bobsingor](https://github.com/bobsingor) – Added multi-selection support with new Redux actions: `ADD_TO_SELECTION`, `REMOVE_FROM_SELECTION`, and `SET_SELECTION`. The `selectedUids` array now tracks multiple selected annotations, with `selectedUid` computed for backward compatibility. Implemented annotation grouping and ungrouping using IRT/RT properties via `groupAnnotations()` and `ungroupAnnotations()` methods. Added unified drag and resize API (`startDrag`, `updateDrag`, `commitDrag`, `cancelDrag`, `startResize`, `updateResize`, `commitResize`, `cancelResize`) that handles multi-annotation operations including attached link annotations. Added `Link` annotation component and `GroupSelectionBox` component for Preact, Svelte, and Vue frameworks. Updated text markup tools to use `strokeColor` and suppress selection layer rects. Improved commit process with `collectPendingChanges`, `executeCommitBatch`, and commit locking to prevent concurrent modifications.

## 2.2.0

### Minor Changes

- [#389](https://github.com/embedpdf/embed-pdf-viewer/pull/389) by [@bobsingor](https://github.com/bobsingor) – Add permission checking for annotation operations:
  - Check `PdfPermissionFlag.ModifyAnnotations` before creating, updating, or deleting annotations
  - Check permission before activating annotation tools
  - Check permission before creating annotations from text selection
  - Update `AnnotationContainer` components (React, Svelte, Vue) to respect `canModifyAnnotations` permission:
    - Disable drag/resize when permission is denied
    - Hide vertex handles when permission is denied
    - Guard double-click handlers based on permission

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The annotation plugin now supports multiple documents with per-document annotation state and tool management.

  ### Breaking Changes
  - **All Actions**: All annotation actions now require a `documentId` parameter:
    - `setAnnotations(documentId, annotations)` - was `setAnnotations(annotations)`
    - `selectAnnotation(documentId, pageIndex, id)` - was `selectAnnotation(pageIndex, id)`
    - `deselectAnnotation(documentId)` - was `deselectAnnotation()` (no params)
    - `setActiveToolId(documentId, toolId)` - was `setActiveToolId(toolId)`
    - `createAnnotation(documentId, pageIndex, annotation)` - was `createAnnotation(pageIndex, annotation)`
    - `patchAnnotation(documentId, pageIndex, id, patch)` - was `patchAnnotation(pageIndex, id, patch)`
    - `deleteAnnotation(documentId, pageIndex, id)` - was `deleteAnnotation(pageIndex, id)`
    - `commitPendingChanges(documentId)` - was `commitPendingChanges()` (no params)
    - `purgeAnnotation(documentId, uid)` - was `purgeAnnotation(uid)`
  - **State Structure**: Plugin state now uses `documents: Record<string, AnnotationDocumentState>` instead of a flat structure. Each document has its own annotations, selected annotation, and active tool.
  - **Capability Methods**: All capability methods that previously operated on a single document now require document scoping or operate on the active document by default.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **AnnotationContainer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-annotation/react`, Svelte: `@embedpdf/plugin-annotation/svelte`, Vue: `@embedpdf/plugin-annotation/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped annotation capability
    - `selectionMenu` prop type changed to `AnnotationSelectionMenuRenderFn` for better type safety
    - Bounding box constraints now use unscaled page dimensions (scale is applied internally)
  - **Annotation Hooks**:
    - All hooks now work with document-scoped capabilities via `forDocument()`
    - Components automatically scope operations to the provided `documentId`

  ### New Features
  - Per-document annotation storage and management
  - Per-document active tool tracking
  - Document lifecycle hooks for automatic state initialization and cleanup
  - `forDocument()` method for document-scoped operations

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Fixed Vue `AnnotationContainer` component where `mixBlendMode` style was incorrectly applied to the selection menu. The style now only applies to the annotation content div, matching the behavior of React and Svelte implementations. This was caused by Vue's attribute inheritance passing the style to the root element which wrapped both the annotation and the selection menu.

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The annotation plugin now supports multiple documents with per-document annotation state and tool management.

  ### Breaking Changes
  - **All Actions**: All annotation actions now require a `documentId` parameter:
    - `setAnnotations(documentId, annotations)` - was `setAnnotations(annotations)`
    - `selectAnnotation(documentId, pageIndex, id)` - was `selectAnnotation(pageIndex, id)`
    - `deselectAnnotation(documentId)` - was `deselectAnnotation()` (no params)
    - `setActiveToolId(documentId, toolId)` - was `setActiveToolId(toolId)`
    - `createAnnotation(documentId, pageIndex, annotation)` - was `createAnnotation(pageIndex, annotation)`
    - `patchAnnotation(documentId, pageIndex, id, patch)` - was `patchAnnotation(pageIndex, id, patch)`
    - `deleteAnnotation(documentId, pageIndex, id)` - was `deleteAnnotation(pageIndex, id)`
    - `commitPendingChanges(documentId)` - was `commitPendingChanges()` (no params)
    - `purgeAnnotation(documentId, uid)` - was `purgeAnnotation(uid)`
  - **State Structure**: Plugin state now uses `documents: Record<string, AnnotationDocumentState>` instead of a flat structure. Each document has its own annotations, selected annotation, and active tool.
  - **Capability Methods**: All capability methods that previously operated on a single document now require document scoping or operate on the active document by default.

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **AnnotationContainer Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-annotation/react`, Svelte: `@embedpdf/plugin-annotation/svelte`, Vue: `@embedpdf/plugin-annotation/vue`)
    - Component now uses `forDocument(documentId)` to get document-scoped annotation capability
    - `selectionMenu` prop type changed to `AnnotationSelectionMenuRenderFn` for better type safety
    - Bounding box constraints now use unscaled page dimensions (scale is applied internally)
  - **Annotation Hooks**:
    - All hooks now work with document-scoped capabilities via `forDocument()`
    - Components automatically scope operations to the provided `documentId`

  ### New Features
  - Per-document annotation storage and management
  - Per-document active tool tracking
  - Document lifecycle hooks for automatic state initialization and cleanup
  - `forDocument()` method for document-scoped operations

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

### Patch Changes

- [`fb323ea`](https://github.com/embedpdf/embed-pdf-viewer/commit/fb323ea28c02b43d885760c952e5a5cf9a0461f9) by [@bobsingor](https://github.com/bobsingor) – Update event type definitions for vue annotation handlers

- [`867c84f`](https://github.com/embedpdf/embed-pdf-viewer/commit/867c84f139ac4f6a9d92ab662985c918e70b86f7) by [@bobsingor](https://github.com/bobsingor) – Add blend mode styling to Vue annotation components

## 1.3.13

### Patch Changes

- [#209](https://github.com/embedpdf/embed-pdf-viewer/pull/209) by [@bobsingor](https://github.com/bobsingor) – Introduces a deepToRaw utility to recursively unwrap Vue refs/reactives, and applies it to annotation rendering to prevent unnecessary re-renders.

- [#208](https://github.com/embedpdf/embed-pdf-viewer/pull/208) by [@bobsingor](https://github.com/bobsingor) – Introduces Vue components for annotation features, including annotation containers, layers, paint layers, and annotation types (circle, square, ink, etc.). Integrates annotation tools into the Vue-Vuetify example, updates toolbar and application logic to support annotation mode, and refactors shared annotation types for better modularity. Also adds supporting hooks and utilities for annotation interaction and state management.

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Minor Changes

- [#172](https://github.com/embedpdf/embed-pdf-viewer/pull/172) by [@bobsingor](https://github.com/bobsingor) – Custom render function if you want the frontend behaviour of annotation to be different

### Patch Changes

- [#172](https://github.com/embedpdf/embed-pdf-viewer/pull/172) by [@bobsingor](https://github.com/bobsingor) – Fix issue with forwarding props on text markups

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

### Patch Changes

- [#164](https://github.com/embedpdf/embed-pdf-viewer/pull/164) by [@bobsingor](https://github.com/bobsingor) – Fix defaults on annotation stamp

- [#164](https://github.com/embedpdf/embed-pdf-viewer/pull/164) by [@bobsingor](https://github.com/bobsingor) – Make interaction mode optional fallback on tool id

## 1.2.0

### Minor Changes

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Remove active variant and make it easier with addTool

### Patch Changes

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Add events on update,delete,create annotations

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Ability to customize the vertex UI and resize UI and the outline selection color

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Fix issue with free text that the text is not selectable

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Move the handlers to the annotation plugin itself to make the framework layer smaller

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Ability to selectAfterCreate, deactiveToolAfterCreate and also overwrite this behavrious on the tool itself

## 1.1.1

## 1.1.0

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

## 1.0.20

## 1.0.19

### Patch Changes

- [#75](https://github.com/embedpdf/embed-pdf-viewer/pull/75) by [@bobsingor](https://github.com/bobsingor) – Update engine model to make it more clear for developers

## 1.0.18

## 1.0.17

### Patch Changes

- [#63](https://github.com/embedpdf/embed-pdf-viewer/pull/63) by [@bobsingor](https://github.com/bobsingor) – Add support for comments on annotations

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Add mobile support for annotations

## 1.0.15

### Patch Changes

- [#54](https://github.com/embedpdf/embed-pdf-viewer/pull/54) by [@bobsingor](https://github.com/bobsingor) – Add support for image stamp

## 1.0.14

### Patch Changes

- [#52](https://github.com/embedpdf/embed-pdf-viewer/pull/52) by [@bobsingor](https://github.com/bobsingor) – Add support for (basic) free text annotation

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add support for polygon, polyline, line, arrow line annotations

- [#49](https://github.com/embedpdf/embed-pdf-viewer/pull/49) by [@bobsingor](https://github.com/bobsingor) – Add support for square and circle annotations

- [`0a83f83`](https://github.com/embedpdf/embed-pdf-viewer/commit/0a83f838728b5d2d5c8d44c91b95f99a08248d30) by [@bobsingor](https://github.com/bobsingor) – Abilty to add selection menu, Proper page boundries on annotation moving, and proper cursor

## 1.0.12

### Patch Changes

- [#46](https://github.com/embedpdf/embed-pdf-viewer/pull/46) by [@bobsingor](https://github.com/bobsingor) – Ability to generate AP stream with blend mode and show blendmode in annotations

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update annotation plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Improvements on text markup annotations (proper AP stream generation) and support for ink annotation

## 1.0.7

### Patch Changes

- [#35](https://github.com/embedpdf/embed-pdf-viewer/pull/35) by [@bobsingor](https://github.com/bobsingor) – Text markup annotation support (Highlight, Underline, Strikeout, Squiggle)

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
