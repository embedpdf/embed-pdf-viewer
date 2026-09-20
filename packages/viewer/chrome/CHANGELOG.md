# @embedpdf/viewer-chrome

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add bold, italic, and underline controls to the FreeText style panel while preserving the active text selection.

  Support `annotations.fonts` for additional font choices. Fonts are fetched, registered with the engine, and mounted for the live editor before appearing in the picker, so editing and PDF output use the same font bytes.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add signature and initials libraries with drawn, typed, and imported artwork, plus signature-field authoring, signing dialogs, and visual-only filling. Configure signers, trust anchors, certification options, and signing modes.

  Add signature inspection with validation details, signed revision downloads, and notices when pending edits would invalidate a signature. Support filtering the stamps sidebar by library kind and showing quick-access stamps in the toolbar.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The Insert tab's Stamp action now opens the stamps sidebar instead of a click-then-pick file dialog; the Image action handles arbitrary PNG and JPEG insertion. The sidebar is now the classic picker over real libraries. Its built-in library comes from `@embedpdf/default-stamps` — the standard rubber stamps as one Acrobat-compatible PDF per locale — loaded on the panel's first open (never at boot), in the locale negotiated from the viewer's language and the browser's, and swapped when the viewer's locale changes; the canvas-drawn placeholder set is gone. The panel gets a library dropdown ("All stamps" plus one entry per library, shown once there are two), a two-column thumbnail grid with the label as tooltip, a hover `×` that removes a stamp from a user library, and per-library export as PDF and remove. Custom libraries persist in IndexedDB across reloads.

  "Make stamp" joins the annotation selection strip: with one or more annotations selected on a page, it turns their appearances into a vector stamp in a "My stamps" library and opens the panel on it. Widgets and pending redaction marks are excluded.

  New `stamps` option on the viewer customization: `stamps: { defaultLibrary: false }` ships no built-in library and makes no request (air-gapped); `stamps: { defaultLibrary: 'https://your.cdn/{locale}/stamps.pdf' }` self-hosts a copy of `@embedpdf/default-stamps`. The default is the copy that ships with the viewer, loaded as a lazy chunk of your own build; nothing is ever fetched from a third party. English and Spanish strings updated.

## 3.0.0-next.11

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The viewer wires the action engine in: `actionsPlugin()` joins the plugin set and the Shell installs the default URI/Print UI adapter.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The chrome save/print commands become the Phase-4 verb owners: `document:download` runs WS → serialize → DS as ONE queued operation (the WillSave mutations are IN the downloaded bytes; two rapid saves can never interleave) and `document:print` runs WP → `window.print()` → DP under the reentrancy latch — both degrading to today's behavior when the actions plugin is absent.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Scripting migrates to `actionsPlugin({ javascript: { enabled: true } })` with a bare `formPlugin()`; the Shell's form scripting provider hook is gone — `useActionsUiAdapter` carries everything.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add a comments and review sidebar with loading, retry, and navigation states,
  plus an anchored editor for annotation links. Commands and controls now
  reflect document and per-record permissions, with updated locale strings for
  the new states.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Enable draggable touch selection handles and register vibration feedback by default when the platform supports it.

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Adopt the unified `RenderLayer` page composition so the full viewer gets policy-driven deep-zoom tiling without mounting a separate tile layer. Base and sharp tile pixels now follow one rendering lifecycle through zoom, pan, annotation, and page-view surfaces.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add a floating text-selection strip with permission-aware Copy, native keyboard clipboard wiring, localized labels, and shared contextual-strip rendering. A successful menu copy clears the unchanged selection so both its highlight and menu dismiss, while failed or superseded copies preserve the current selection.

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the shared implementation package for the full viewer interface. It contains the measured toolbar, menus, panels, responsive layout, and default feature composition consumed by the distributable viewer packages.
