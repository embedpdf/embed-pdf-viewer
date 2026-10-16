# @embedpdf/viewer

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The form designer: the Form mode opens for filling in, and **Form design** (`form:design`) switches design on, with a sidebar that lists the fields by page, shows the selected field's settings, and adds buttons to a radio group or boxes to a checkbox next in line. A field's look is in the Style sidebar, on the Form toolbar too. Selecting a field in the Form mode works again: the form plugin no longer misses the annotation plugin.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<embedpdf-viewer>` looks the same on every page. Borders, shadows and rings draw on pages without Tailwind of their own; every size is in px, so the page's `html { font-size }` no longer resizes the viewer; the text styles a page's `body` passes down (font, size, letter spacing, italics, weight, alignment, color scheme) no longer reach inside. Dialogs and click-away backdrops cover the viewer, not the page around it. A `--epdf-*` variable set on the element or on any element around it now wins in light and in dark, over the viewer's defaults and over `theme.tokens`, which apply when the page sets none.

  The viewer runs under the strict Content Security Policy on the Security page, with Trusted Types enforced: no `'unsafe-inline'`, no `'unsafe-eval'`, `worker-src 'self'`. The CDN folder now carries `embedpdf-worker.js` and `encoder-worker.js` beside `embedpdf.wasm`; served from your own origin they start as files, and loaded from a CDN the engine starts them from `blob:` URLs (`worker-src blob:`).

  The npm build leaves `@embedpdf/core`, the plugins and `@embedpdf/web` to your bundler instead of carrying its own copies, and lists them as dependencies. Your app and the viewer load one copy of each, so the headless hooks of your own `@embedpdf/react` work in the components you put inside the viewer, and your bundle gets smaller.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The style panel, its flags, a form field's settings, the link editor and the thumbnails' tooltips are translated in all 13 languages, by keys an app can change in `strings` (`'annotation.style.stroke'`, `'form.settings.tooltip'`). Readers of Traditional Chinese see English rather than Simplified Chinese. The Go to Page dialog reads "Page [3] of 8" again.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Ctrl/Cmd+F is Find (`search:find`): it opens search with the cursor in its field and the text selected, keeps it open, and works from any text field in the viewer, so pressing it again selects the search text instead of opening the browser's find. The Search button puts the cursor in the field too. `viewer.get('shell').open(id, { focus: true })` opens a panel asking for the cursor; a plain `open(id)` leaves it where it is.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A door may say how its documents open and what plugin settings its engine needs: `DoorEngine.sourceOf` turns a `src` in its engine's words (the cloud's `{ token }`) into what the engine opens, for `src`, `documents` and `.src =`, and `DoorEngine.plugins` goes under the config's own, plugin by plugin. `ElementSrc` takes a door's own documents (the element reads only URLs, files, bytes and open inputs), and a document no door said how to open fails as `invalid-input` instead of being read as bytes.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The `layout` config replaces `chrome`: a layout, or `(layout, env) => layout` with the viewer's env (`size`, `width`, `touch`, `dir`), run again when the viewer's size changes. `defaultLayout`, `createLayout` and the layout types (`Layout`, `LayoutEnv`, `LayoutData` and the rest) are exported; `defaultChrome`, `defineChrome`, `chromeHelpers`, `validateChrome` and the bar sugar are removed.

  The viewer's commands use the documented ids (`tool:highlight`, `view:rotate-clockwise`, `menu:document`, `panel:thumbnails`…) and belong to the documented features, so `disable: ['annotations.highlight']` turns off the highlighter everywhere. A user whose scope doesn't allow something doesn't see its tools, and Ctrl/Cmd+P without printing, or Ctrl/Cmd+C on text the user may not copy, shows a short notice instead of printing or copying the page.

  `<embedpdf-viewer>` follows five keys while it runs: `src`, `theme`, `locale`, `disable` and `readOnly` change in place, whether they come from `.config`, from the element's own properties (`element.src = file`, `.theme`, `.locale`, `.disable`, `.readOnly`) or from the `src`, `theme` and `locale` attributes. A new `src` opens in place of the old document, at its tab position, and `null` closes it; `theme` swaps the token sheet and the mode, `locale` the language. Any other change still builds a new viewer. The viewer, and `element.viewer`, stay the same objects across live changes. `.config` now goes over the attributes instead of replacing them, so `<embedpdf-viewer src="…">` keeps its document when a script sets `.config` without one.

  `src` takes a URL, a `File` (any `Blob`) or the PDF's bytes (`ArrayBuffer` or `Uint8Array`, copied, so your buffer stays usable). The config takes `disable` (features such as `'annotations'` or `'annotations.highlight'`, and single commands such as `'tool:highlight'`, in one list; it replaces `disabledCategories`), `readOnly` (`true`, or `{ except: ['forms.filling'] }`), `scope` and `identity` for every document the viewer opens, and `notAllowed: 'hide' | 'disable'`.

  `element.viewer` is the `Viewer`: `get(name)` returns a plugin's API by its name (`viewer.get('search')`), or by its token as before, `viewer.documents` and `viewer.commands` are the documents and commands plugins with their events, and `watch` and `forDocument` stay. `on()`, `execute()`, `resolve()` and `watchCommand()` are removed: use `viewer.documents.onOpened(…)`, `viewer.commands.execute(id)` and `viewer.commands.resolveCommand(id)`. The `Viewer` type replaces `ViewerHandle`, and `ScopedViewer` replaces `ScopedViewerHandle`. New type exports: `DocumentSrc`, `LiveConfigKey`, `Feature`, `ReadOnlyExceptions`, `Identity`, `ViewerPlugins`, `PluginName`, `CommandsCapability`, `NotAllowedMode`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – New `@embedpdf/viewer/portable`: the viewer with the engine's portable build, for toolchains that can't emit the engine's files, such as plain esbuild. Import it in place of `@embedpdf/viewer`; the surface and the config are the same. The WebAssembly comes as a lazy chunk of your own build and both workers start from `blob:` URLs, so a strict policy needs `worker-src blob:` (or copy the two worker files and set `engine.worker` and `engine.encoderWorker`). Nothing is requested from another origin. The npm entries also no longer leave a bare import of a side-effect-free package behind, which esbuild warned about.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Toolbars go anywhere the layout puts them: vertical bars along the left and right edges (`place: 'start'` or `'end'`, swapped in a right-to-left language), several bars on one edge in order, and bars floating over the pages (`place: { float: 'bottom-end' }` and the other seven positions). The page number floats at the bottom of the pages as the `pager` bar, and pressing it lets you type the page to go to. The document tabs now show only while more than one document is open; `layout.tabs('always')` brings back a tab for a single document.

  `onReady` and `onDocumentChange` are config keys, read once like the others: `onReady` gets the `viewer` once it's live, and `onDocumentChange` gets the active document's id whenever it changes, the first one included, and `null` once the last one closes. The element's `epdf:ready` and `epdf:documentchange` fire at the same moments, each just before its callback; `epdf:ready` now comes before the first `epdf:documentchange`.

  `@embedpdf/plugin-history` is listed as a dependency: the viewer's undo and redo use it.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Panels come from the layout: move one with `layout.panel('thumbnails', { side: 'end' })`, add your own with `layout.addPanel('notes', { title: 'Notes', icon: 'book' })` and its `panel:notes` button comes with it, and `layout.removePanel(id)` takes one out with its button. One panel shows per side, both sides at once; the header of an open panel switches between the panels on its side; a panel whose feature you turn off closes, live; and each document keeps its own open panels. A panel's body is the slot `panel:<id>`.

  Panels open the way the viewer's size calls for: docked beside the pages in a wide viewer, with an edge you drag to make them wider or narrower (the width is kept while the viewer runs), over the pages' edge at medium widths, where only the pages dim and the toolbars keep working, and as a sheet from the bottom on a phone, which its handle drags taller, shorter or closed. A panel's `present` chooses one for every size, or for the sizes it names (`{ compact: 'overlay' }`: no sheet on a phone), and `layout.panels(changes)` changes every panel at once. `width` is where a panel starts (`360`) or that and how far it drags (`{ initial, min, max }`), `resizable: false` takes its edge away, and `onPanelResize` (the element's `epdf:panelresize`) tells you each width the user gives a panel, to keep for next time. The thumbnails wrap into more columns as their panel widens; `plugins.thumbnails` takes their Stage settings and `viewer.get('thumbnails')` is their Stage. The thumbnails and the search results close from a sheet or an overlay once you pick something in them.

  On a phone, menus open as sheets too, with submenus sliding in over them and a Back row, and the page number hides while you scroll. With a finger as the main pointer, every button and menu row is at least 44 px tall, and a viewer that reaches the edge of the screen keeps clear of the notch and the home bar.

  Sheets and dialogs take focus when they open, keep it until they close, close on Escape, and give focus back to the button that opened them; an overlay does the same but lets Tab move on to the toolbars; docked panels are labeled regions.

  Your own components in plain HTML: give a child of `<embedpdf-viewer>` the slot `item:<id>` (a toolbar item), `panel:<id>` (a panel's body), or a region's name (`header`, `footer`, `tabs`, `empty`). A toolbar item's element carries where it sits as `data-orientation`, `data-edge`, `data-variant` and `data-size`, for your CSS. The viewer's own components come with it: `<epdf-button command="zoom:in">` is that command's button (or give it `icon` and `label`, and handle its click), and `<epdf-menu icon label>` opens a menu of its `<epdf-menu-item command|icon>` rows the way the viewer's menus open, firing `select` on the row picked. They're drawn with the viewer's look and tokens, from constructed stylesheets (no `<style>` element), and are stops of a toolbar's arrow keys. `ToolbarItemContext` and `ToolbarItemEdge` are exported.

  `plugins` in the config gives each built-in plugin its settings by name and adds plugins of your own, which `viewer.get(name)` finds. `engine.fonts` replaces `annotations.fonts`: the fonts are fetched once, registered on the engine, mounted for the live editor and offered in the style panel. When the viewer mounts again with a new config, or the element leaves the page, its old `viewer` is done: its listeners stop, its calls refuse with `instance-closed`, and `onReady` brings the new one. Exports `ViewerPluginsConfig`, `PluginSettings`, `ViewerFont` and the remaining capability tokens (`RenderToken`, `LinkToken`, `PageEditToken`, `ActionsToken`); a door's engine provider now returns `{ engine, fonts }` (`DoorEngine`).

  People open files themselves: **Open** in the document menu (`Ctrl`/`Cmd`+`O`) asks for a PDF, and a PDF dropped on the pages opens too, each as a new tab, with a drop target while it's dragged over. Both are the `document:open` command, so `disable: ['documents.open']` turns them off together. The tab strip no longer has a "+" button.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – An `<embedpdf-viewer>` marked `data-epdf-wrapped` waits for its `.config` instead of mounting from its attributes. Every framework wrapper marks the element it renders, so an element the server rendered no longer starts a viewer of its own when the viewer's code loads before hydration: before, it started one from its attributes that the wrapper's config then replaced, and on the engine-agnostic door it had no engine to start with. Without the mark, an element still mounts from its attributes, as in plain HTML.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Commands and shortcuts, as Buttons & commands describes them: a command of yours with its own `label`, whose functions get `get` (a plugin by its name), the `viewer` and the `documentId`; a command with a built-in id that changes only the fields it gives; your shortcut winning over a built-in one with the same keys; icons as `{ paths, fill }`, and a built-in icon replaced by yours of the same name. Keyboard shortcuts reach a viewer only while focus is inside it, and a press on the pages puts it there; `?` opens the shortcuts sheet, Ctrl/Cmd+F opens search, Ctrl/Cmd+O opens a file, Ctrl/Cmd+S downloads and Delete removes the selected annotations. New built-in commands: `page:next`, `page:previous`, `page:first`, `page:last`, `page:go-to`, `selection:highlight`, `selection:underline`, `selection:strikeout` and `redaction:apply`, and `tool:<id>` for a tool of your own. The `CommandContext`, `IconName` and `IconPaths` types are exported.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `documents` takes entries of `{ src, name, password, active }`: each opens in a tab of its own (two entries of one URL are two documents), named as given or after its file, with its password so nobody is asked for it, and the one marked `active` shows first. The `DocumentEntry` type is exported; `InitialDocument` is no longer part of the viewer's types.

  A document that can't be opened says why: a URL the server doesn't have fails as `not-found`, and a file or URL whose bytes aren't a PDF (a sign-in page, an image) fails as `invalid-input`, in `viewer.documents.get(id).error`.

  On `@embedpdf/viewer/core`, `src` and each entry's `src` also take an engine's open input as it is (`{ kind: 'token', token }` for the cloud engine), and `src` still follows its prop: another one opens in place of the first, which closes first when both name the same document. The `ElementSrc` type names what the element opens.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The viewer-only settings of stamps and signatures go in `plugins`, next to the plugin's own: `plugins.stamp.standard` and `plugins.stamp.quick` (`['standard:Approved']`), `plugins.signature.kinds` and `plugins.signature.fonts`, and the signer in `plugins.signature.key`. The `stamps` and `signatures` keys are gone; `ViewerStampSettings`, `ViewerSignatureSettings` and `SignatureFont` replace `StampsCustomization` and `SignaturesCustomization`. Typed signatures offer three handwriting fonts by default (Allura, Great Vibes, Caveat, from `@embedpdf/default-signature-fonts`), each a lazy chunk of your build.

  A smaller first load, in the npm build and the CDN folder alike: the panels and dialogs of each feature are chunks of their own, fetched in the background once the document shows and the browser is idle, and the signature cryptography loads the first time someone signs or a document's signatures are checked.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `theme` takes `accent`, and `tokens` and `dark` take the Theming page's tokens: `accent`, `background`, `surface`, `surface-raised`, `text`, `text-muted`, `border`, `hover`, `canvas`, `radius` and `font`. Each is also the CSS variable `--epdf-<name>`, which the page can set on `<embedpdf-viewer>` or around it, and which wins over the config, in light and in dark. The viewer's root takes its font and text color from `--epdf-font` and `--epdf-text`. `ThemeConfig`, `ThemeToken` and `ThemeTokens` are exported.

  Every bar and every button in a bar is a part page CSS reaches with `::part()` (`toolbar`, `toolbar-button`), and the bars over a selection sit above it, below it when there's no room.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `viewer.get('metadata')` is the metadata plugin, as Plugins lists it: the document's title, author and your own fields, read the first time something asks (`await viewer.get('metadata').ensureLoaded()`, or `useMetadataState()` in your components inside the viewer), never as a document opens.

### Patch Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The comments panel and the style panel key annotations with `annotationKey`; the panel's private JSON key is gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A theme token that names an EmbedPDF theming variable, such as `accent`, sets that `--epdf-*` variable, so it themes the pages as well as the chrome.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Exports `DocumentInfo` (was `DocInfo`), the documents capability's type for an open document.

- [#868](https://github.com/embedpdf/embed-pdf-viewer/pull/868) by [@bobsingor](https://github.com/bobsingor) – The viewer's first load carries no zod and no schema: it predicts what a write will do without schema validation, and the engine checks the write in its worker; a change the engine refuses leaves the view. An npm app's main-thread JavaScript at first load goes from 1217 to 1081 KB (380 to 341 KB gzipped), the CDN snippet's from 1699 to 1513 KB (455 to 408 KB gzipped). Without a `Worker`, the engine runs in the page from one self-contained chunk, loaded only then.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Ctrl/Cmd+C and Edit → Copy reach a viewer only while focus is inside it, like its other shortcuts: with two viewers on a page only the one focus is in copies its selected text, and the page keeps its own copying everywhere else.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update the built-in viewer doors and kernel setup for the revised plugin
  context, document references, and viewer configuration.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The snippet's first download no longer carries the engine host and PDFium's runtime, which run in the engine's worker: its main-thread JavaScript is a third smaller (a fifth gzipped). They load only where the browser has no `Worker` and the engine runs in the page.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Export MeasurementToken through every viewer entry point so applications can access page calibration and measurement controls through the viewer handle.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Expose `AnnotationFontSpec` and `AnnotationsCustomization` through the viewer entry points so applications can configure additional FreeText fonts with `annotations.fonts`.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Expose `SignatureToken`, signer adapters, personal key stores, and signature customization types through the viewer's core entry point so applications can configure and control signing from the viewer package.

## 3.0.0-next.12

### Patch Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The built-in stamp library ships inside the viewer instead of being fetched from a CDN. The npm entry keeps `@embedpdf/default-stamps/library` external, so its locale modules become lazy chunks of your own build; the CDN snippet carries them as sibling chunks in its folder. `@embedpdf/default-stamps` is now a dependency. Previously a library build could inline the eight PDFs into the JS chunk as base64, a form webpack rejects.

  The viewer registers `stampPlugin()`, exposes `StampToken` through its drive door, and routes the Insert tab's Stamp action to the stamps sidebar. Arbitrary PNG and JPEG insertion remains available through the Insert tab's Image action.

  The CDN snippet (`dist/embedpdf.js`) once again finds `embedpdf.wasm` when loaded from another origin: the wasm is now an asset Vite emits into the dist folder and references by a URL relative to whichever chunk needs it, instead of a path guessed against the entry file — which had resolved to `chunks/embedpdf.wasm` and failed. A cross-origin test (`pnpm test` in the viewer package, Playwright against the built artifact) now guards it: the snippet must render with every sibling fetched from its own folder and no request to any other origin.

## 3.0.0-next.11

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete EmbedPDF viewer as a custom element and CDN-ready artifact. It exposes `<embedpdf-viewer>` and `EmbedPDF.init()`, bundles the shared viewer chrome, and wires in the local WASM engine by default.
