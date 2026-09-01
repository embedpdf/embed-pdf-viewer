# @embedpdf/angular

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – NEW `@embedpdf/angular/actions` entry: `injectActionsUiAdapter(handlers?)` — Angular's spelling of React's `useActionsUiAdapter` (the `inject*` law), installing the SHARED default policy from `@embedpdf/web` so the two bindings can never drift; re-exports the `@embedpdf/plugin-actions` contract. The parity gate goes green (`actions` ported; `anchored` consciously added to PENDING).

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Route the Stage adapter's interaction dependency through the bundle-safe plugin contract entry instead of the interaction implementation root.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Rename `EpdfPageContext.toPagePoint()` to `toContentPoint()` and align the
  Angular page context with the content-space page transform API.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Move Angular Stage input handling to the shared web surface controller, with lens-scoped interaction and native touch pan, pinch, fling, double-tap, and long-press gestures. Interaction now defaults on when the hub is present and can be disabled for secondary lenses.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt Angular adapter for EmbedPDF v3. It provides reactive bindings, structural viewer and stage components, injectable capabilities, and headless feature layers through focused secondary entry points.
