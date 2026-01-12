# @embedpdf/plugin-scroll

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

## 2.0.1

## 2.0.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The scroll plugin now supports per-document scroll state and strategies.

  ### Breaking Changes
  - **Actions**: Complete action refactoring:
    - Replaced `UPDATE_SCROLL_STATE` with `UPDATE_DOCUMENT_SCROLL_STATE` that requires `documentId`
    - Replaced `SET_DESIRED_SCROLL_POSITION` and `UPDATE_TOTAL_PAGES` with document-scoped actions
    - Replaced `SET_PAGE_CHANGE_STATE` with document-scoped state management
    - Added `SET_SCROLL_STRATEGY` action for per-document scroll strategies
  - **State Structure**: Plugin state now uses `documents: Record<string, ScrollDocumentState>` to track per-document scroll state including position, page change state, and scroll strategy.
  - **Action Creators**: All action creators now require `documentId`:
    - `initScrollState(documentId, state)`
    - `updateDocumentScrollState(documentId, state)`
    - `setScrollStrategy(documentId, strategy)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Scroller Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-scroll/react`, Svelte: `@embedpdf/plugin-scroll/svelte`, Vue: `@embedpdf/plugin-scroll/vue`)
    - Removed `overlayElements` prop
    - `renderPage` prop now receives `PageLayout` instead of `RenderPageProps`
    - Component subscribes to document-specific scroller data

  ### New Features
  - Per-document scroll state tracking
  - Per-document scroll strategies
  - Document lifecycle management with automatic state initialization and cleanup

### Minor Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Added `pageNumber` and `totalPages` properties to `LayoutReadyEvent`. This allows consumers to get the current page information immediately when the layout becomes ready, without needing to subscribe to a separate `onPageChange` event.

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – ## Remove `initialPage` Config & Add `isInitial` to `LayoutReadyEvent`

  ### Breaking Changes
  - **Removed `initialPage` config option**: The `initialPage` configuration option has been removed from `ScrollPluginConfig`. With multi-document support, a global initial page setting no longer makes sense.

  ### Migration

  To scroll to a specific page when a document loads, use the `onLayoutReady` event instead:

  ```tsx
  import { useCapability } from '@embedpdf/core/react';
  import type { ScrollPlugin } from '@embedpdf/plugin-scroll';

  const ScrollToPageOnLoad = ({ documentId, initialPage }) => {
    const { provides: scrollCapability } =
      useCapability<ScrollPlugin>('scroll');

    useEffect(() => {
      if (!scrollCapability) return;

      const unsubscribe = scrollCapability.onLayoutReady((event) => {
        if (event.documentId === documentId && event.isInitial) {
          scrollCapability.forDocument(documentId).scrollToPage({
            pageNumber: initialPage,
            behavior: 'instant',
          });
        }
      });

      return unsubscribe;
    }, [scrollCapability, documentId, initialPage]);

    return null;
  };
  ```

  ### New Features
  - **`isInitial` flag on `LayoutReadyEvent`**: The `onLayoutReady` event now includes an `isInitial` boolean that is `true` only on the first layout after document load, and `false` on subsequent layouts (e.g., when switching between tabs). This allows distinguishing between initial document load and tab reactivation.

## 2.0.0-next.3

## 2.0.0-next.2

### Minor Changes

- [`89b94a0`](https://github.com/embedpdf/embed-pdf-viewer/commit/89b94a09659ad63eeab6b66fc56f8110a07a8f57) by [@bobsingor](https://github.com/bobsingor) – Added `pageNumber` and `totalPages` properties to `LayoutReadyEvent`. This allows consumers to get the current page information immediately when the layout becomes ready, without needing to subscribe to a separate `onPageChange` event.

## 2.0.0-next.1

### Minor Changes

- [#283](https://github.com/embedpdf/embed-pdf-viewer/pull/283) by [@github-actions](https://github.com/apps/github-actions) – ## Remove `initialPage` Config & Add `isInitial` to `LayoutReadyEvent`

  ### Breaking Changes
  - **Removed `initialPage` config option**: The `initialPage` configuration option has been removed from `ScrollPluginConfig`. With multi-document support, a global initial page setting no longer makes sense.

  ### Migration

  To scroll to a specific page when a document loads, use the `onLayoutReady` event instead:

  ```tsx
  import { useCapability } from '@embedpdf/core/react';
  import type { ScrollPlugin } from '@embedpdf/plugin-scroll';

  const ScrollToPageOnLoad = ({ documentId, initialPage }) => {
    const { provides: scrollCapability } =
      useCapability<ScrollPlugin>('scroll');

    useEffect(() => {
      if (!scrollCapability) return;

      const unsubscribe = scrollCapability.onLayoutReady((event) => {
        if (event.documentId === documentId && event.isInitial) {
          scrollCapability.forDocument(documentId).scrollToPage({
            pageNumber: initialPage,
            behavior: 'instant',
          });
        }
      });

      return unsubscribe;
    }, [scrollCapability, documentId, initialPage]);

    return null;
  };
  ```

  ### New Features
  - **`isInitial` flag on `LayoutReadyEvent`**: The `onLayoutReady` event now includes an `isInitial` boolean that is `true` only on the first layout after document load, and `false` on subsequent layouts (e.g., when switching between tabs). This allows distinguishing between initial document load and tab reactivation.

## 2.0.0-next.0

### Major Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  The scroll plugin now supports per-document scroll state and strategies.

  ### Breaking Changes
  - **Actions**: Complete action refactoring:
    - Replaced `UPDATE_SCROLL_STATE` with `UPDATE_DOCUMENT_SCROLL_STATE` that requires `documentId`
    - Replaced `SET_DESIRED_SCROLL_POSITION` and `UPDATE_TOTAL_PAGES` with document-scoped actions
    - Replaced `SET_PAGE_CHANGE_STATE` with document-scoped state management
    - Added `SET_SCROLL_STRATEGY` action for per-document scroll strategies
  - **State Structure**: Plugin state now uses `documents: Record<string, ScrollDocumentState>` to track per-document scroll state including position, page change state, and scroll strategy.
  - **Action Creators**: All action creators now require `documentId`:
    - `initScrollState(documentId, state)`
    - `updateDocumentScrollState(documentId, state)`
    - `setScrollStrategy(documentId, strategy)`

  ### Framework-Specific Changes (React/Preact, Svelte, Vue)
  - **Scroller Component**:
    - Now requires `documentId` prop (React/Preact: `@embedpdf/plugin-scroll/react`, Svelte: `@embedpdf/plugin-scroll/svelte`, Vue: `@embedpdf/plugin-scroll/vue`)
    - Removed `overlayElements` prop
    - `renderPage` prop now receives `PageLayout` instead of `RenderPageProps`
    - Component subscribes to document-specific scroller data

  ### New Features
  - Per-document scroll state tracking
  - Per-document scroll strategies
  - Document lifecycle management with automatic state initialization and cleanup

## 1.5.0

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `Scroller.svelte` component and `useScroll` hook to use refactored core hooks and return a reactive state object. Introduced shared `RenderPageProps` type. Adjusted Vue components accordingly.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useScroll`, etc.) and `Scroller.svelte` component. Thanks to @andrewrisse for adding the Svelte adapter and hooks!

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

### Patch Changes

- [#187](https://github.com/embedpdf/embed-pdf-viewer/pull/187) by [@bobsingor](https://github.com/bobsingor) – Add isPageChanging event to the scrol plugin

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactor scroller layout API and scroll helpers.
  - **Moved scroller layout APIs from capability → plugin instance**
    - Removed from `ScrollCapability`:
      - `onScrollerData`
      - `getScrollerLayout`
    - Added to `ScrollPlugin`:
      - `onScrollerData(callback): Unsubscribe`
      - `getScrollerLayout(): ScrollerLayout`
  - Exposed `ScrollBehavior` type (`'instant' | 'smooth' | 'auto'`) and plumbed through all scroll helpers.
  - Bound capability methods to plugin instance:
    - `scrollToPage`, `scrollToNextPage`, `scrollToPreviousPage` now call internal plugin methods (no behavior change for callers).
  - Added auto-jump on first layout:
    - If `initialPage` is set, we now scroll **instantly** to it after layout ready.
  - Strategy/base types:
    - `BaseScrollStrategy.getTotalContentSize()` now returns `Size` instead of `{ width; height }`.
    - Page-rect computations now account for horizontal centering within `totalContentSize`.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

## 1.0.18

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Make the scroll plugin work with Vue

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update scroll plugin to have shared code between react and preact to simplify workflow

## 1.0.11

### Patch Changes

- [`8bb2d1f`](https://github.com/embedpdf/embed-pdf-viewer/commit/8bb2d1f56280ea227b323ec0cdd90478d076ad97) by [@bobsingor](https://github.com/bobsingor) – Send emit message when the layout is ready so that you can easily do initial page scroll

## 1.0.10

### Patch Changes

- [`f629db4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f629db47e1a2693e913defbc1a9e76912af945e3) by [@bobsingor](https://github.com/bobsingor) – Some small bugfixes, in some cases interactionmanager state can be null and gives error on fast reload, add get state to selection manager for debugging purposes and make @embedpdf/model a dependency of scroll to make sure it doesn't get add inline inside the component

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
