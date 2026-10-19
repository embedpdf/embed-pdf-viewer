# @embedpdf/viewer-chrome

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `stamps.assetEngine` names the local engine that stamp libraries and signature marks open in: an engine, or a function that makes one on first use. Left out, they open in the viewer's own engine, which only works when that engine is local.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The form designer. The Form mode opens for filling in; its **Form design** button (`form:design`) switches design on: fields select, move, resize and delete, and the form design sidebar (`form-design`) opens. A field tool switches design on too, and pressing Form design again or leaving the Form mode ends it. The sidebar lists the document's fields by page, and a click selects one and scrolls to it; with a field selected it shows the field's settings and, for a radio group or a checkbox, its buttons with **Add a button** or **Add a box**, which adds one next in line and selects it. A field's look stays in the Style sidebar, now on the Form toolbar too, and its settings left it. Every word is in all 13 languages.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - The style panel shows a Field section for a selected form field: name, tooltip, required, read-only, and its type's own settings.
  - The Form tab places push buttons.
  - Deleting selected form fields is one change, as the form says: a field goes whole when every box of it is selected.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Undo and redo work: the toolbar buttons, `Mod+Z`, and `Shift+Mod+Z` or `Mod+Y` undo and redo what the user changed, even while it is still on its way. A text field keeps its own undo.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The style panel speaks the viewer's language: its property labels, the line endings, blend modes, fonts, alignments and border styles, the flags and what each does, a form field's settings, the link editor, the thumbnails' tooltips and the panel's own words read from the language packs, by the libraries' `labelKey`s (`annotation.style.*`, `annotation.flags.*`, `form.settings.*`). Every key is in all 13 packs; the new words are machine-written and marked for a native speaker's review, as the other packs' are. The line-ending and border pickers name their options for screen readers. Readers of Traditional Chinese see English rather than Simplified Chinese, and the Go to Page dialog reads "Page [3] of 8" again (it split the sentence at every character).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Ctrl/Cmd+F is Find (`search:find`, with a search panel in the layout): it opens search with the cursor in its field and the text selected, and never closes it. It works from any text field in the viewer, the search field among them, so pressing it again selects the search text instead of opening the browser's find. The Search button puts the cursor in the field too (`panel:search` opens asking for focus), and an overlay or a sheet no longer takes focus from a field that took it as the panel opened. "Find" is in every language pack.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `layout` replaces `chrome`: a layout, or `(layout, env) => layout`, which gets the default layout and the viewer's env (`size`, `width`, `touch`, `dir`, measured on the viewer) and runs again when the env changes. `defaultLayout` replaces `defaultChrome`. A bar with a new `mode` adds its tab and its `mode:<id>` command; a bar with nothing visible draws nothing, a mode whose bars show nothing has no tab (an open one falls back to View), and a menu section, or a menu button, with nothing visible is gone. Menu sections show their titles. A layout that names an id the viewer doesn't have logs a warning with the closest id that exists.

  The built-in commands use the documented ids: `tool:<name>` for every tool (`tool:highlight`, `tool:square`, `tool:text-field`, `tool:redact`, `tool:distance`…), `view:rotate-clockwise`, `view:single-page`, `view:two-pages`, `view:cover-page`, `view:scroll-vertical`, `view:fullscreen`, `menu:document`, `menu:view`, `menu:zoom`, `panel:thumbnails`, `panel:comments` and `panel:style`. The view menu is `view`, the zoom field is the custom item `zoom`, and the groups and strip bars take the documented ids (`view`, `choices`, `signatures`, `actions`, `danger`, `selection`, `annotation`). Each command belongs to its feature (`annotations.highlight`, `shapes`, `forms.building`, `documents.print`…) and says what the scope must allow with `requires`, so a user without a permission doesn't see its tools; under `notAllowed: 'disable'` their tooltip says why. A shortcut whose command is turned off or not allowed, and Ctrl/Cmd+C on text the user may not copy, show a short notice instead of reaching the browser.

  `FullViewer` takes `disable` (features and single command ids in one list, replacing `disabledCategories`), `readOnly` (`true` or `{ except }`, on top of `disable`, only the interface), `scope` and `identity` (passed to the headless `<Viewer>`, so documents opened after a change use them) and `notAllowed`. `theme`, `locale`, `disable` and `readOnly` follow their props on a running viewer: the mode, the language and the commands' disabled settings change in place, and a `'system'` theme switches when the operating system's does. An explicit `locale` shows the closest language the viewer has (`'es-MX'` shows Spanish), else English.

  The viewer handle is now `Viewer`, made by `createViewer(kernel, plugins)`: `get(name)` and `tryGet(name)` take a plugin's name (`VIEWER_PLUGINS` lists them, `ViewerPlugins` types them) or its token, `documents` and `commands` are the two capabilities, and `watch` and `forDocument` stay. `on()`, `execute()`, `resolve()` and `watchCommand()` are removed, with `createViewerHandle`, `ViewerHandle` and `ScopedViewerHandle` (now `ScopedViewer`). `useTheme()` gives the mode only.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The viewer draws a bar in every place the layout gives it. Bars at `start` and `end` are vertical toolbars along the left and right edges, several per edge stacked from the outside in, and they swap sides in a right-to-left language: the viewer's root now carries its language's `dir`, while the pages keep their own layout. A docked panel sits inside the edge bars, beside the pages, and the top and bottom bars run the full width. Bars placed `{ float: … }` float over the pages in any of the eight positions, as a pill with a shadow, 20 px in from the edges so they clear the scrollbars, under the bars over a selection and under menus and dialogs. Each bar tells the menus that open from it which edge it is on.

  The page number is the `pager` bar's `{ custom: 'page-number' }` item, floating at the bottom of the pages as before, and it now goes to a page: press the number, type a page and press Enter (Escape keeps the page). The `PageControls` overlay is gone. `{ custom: 'zoom' }` draws the zoom field unless its variant is `'button'`, and a vertical bar draws its button.

  The document tabs show only while more than one document is open, unless the layout says otherwise with `tabs('always')` or `tabs('never')`.

  Menus open the right way and work from the keyboard. A menu opens away from the edge its bar sits on (below a top bar, above a bottom bar, beside a side bar, toward the middle from a floating bar), on the other side when there's no room, and moves to stay on screen. Menus open in the browser's top layer, so no bar, panel or the viewer's own box clips them, and a press anywhere outside closes them. The "More" menu and a folded group's menu open the same way, and a group with `collapse: 'menu'` draws as a menu button. A menu named by buttons in two bars opens only at the one pressed (at the first one drawn when code opens it), and a menu command in the bar over a selection opens its menu below that bar, away from the selection.

  Arrow keys, Home and End move through a menu, typing jumps to the item that starts with it, Enter and Space pick, and Escape closes the menu and gives focus back to its button, which says it's expanded. Rows are menu items to a screen reader, section titles name their groups, and the current choice is marked like an active toolbar button, in the accent color, never like the row the keyboard is on (`menuitemradio` / `menuitemcheckbox` with `aria-checked`; an outline with forced colors). A row whose command opens a menu opens it beside it, with a click or the arrow key toward it, and the arrow back closes it. Each row shows its command's shortcut, and a row that can't run says why in its tooltip.

  The `style` and `history` groups of the default mode bars are dependent: a mode bar left with only style, undo and redo shows nothing, and its tab goes. A read-only viewer shows no mode tabs, and turning off stamps, attachments and signatures removes the Insert tab. `onReady` and `onDocumentChange` are part of the customization: `onReady` gets the `viewer` once it's live, and `onDocumentChange` gets the active document's id whenever it changes, the first document included, and `null` once the last one closes. They replace `FullViewer`'s `onViewer`.

  What a turned-off feature made stays in the document, frozen: under `readOnly`, or with a feature in `disable`, its annotations can be selected and read but not moved, resized, restyled or deleted, and form fields take no input while filling is off; both follow the props live. A View only label (`{ custom: 'view-only' }`, in the main bar) shows while nothing can change the document, or the scope allows no change. The comments panel only reads while comment writing is off: no reply box, status, edit or delete.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Panels come from the layout. The default layout lists every built-in panel by its id (`thumbnails`, `outline`, `attachments`, `search`, `comments`, `style`, `stamps`, `signatures`, `redaction`, `measurement`) with its side, title (`titleKey`) and icon, and the viewer draws the open ones from it: `layout.panel('thumbnails', { side: 'end' })` moves a panel, `layout.addPanel(id, panel)` adds your own and `layout.removePanel(id)` takes one out with its button. Every panel gets a `panel:<id>` command that opens and closes it, labeled and drawn by the panel's title and icon, so a panel you add has its button without a command of your own; the built-in ones go with their feature (`disable: ['thumbnails']`), and `defaultCommands` no longer lists them. The panels' surfaces use the same ids (`thumbnails`, `comments`, `style`).

  One panel shows per side, both sides at once: opening a panel closes the one open on its side, however it was opened, and the header of an open panel switches between the panels on its side. A panel whose button goes while it's open (its feature turned off with `disable` or `readOnly`, live) closes. Each document keeps its own open panels, so switching tabs brings them back. Every panel opens in the viewer's panel frame, which names it after its title for assistive technology, and its body is the slot `panel:<id>`: the built-in content is the slot's fallback, and a panel of your own shows what you put in its slot, or nothing. In a sheet or an overlay, picking a page in the thumbnails closes it. The thumbnails wrap into as many columns as the panel's width fits (one at the default width); they're a second Stage, which `viewer.get('thumbnails')` finds and `plugins.thumbnails` gives its settings (`zoom: { pageWidth: 110 }`, `columns: 1`). The tools that open a panel (the stamp and signature tools, the comment and style buttons over a selected annotation) open it through its `panel:<id>` command.

  The outline and attachments panels have no button yet: there is nothing for them to show.

  Panels open in a frame (`PanelFrame`) that decides how: what the panel's `present` says for the viewer's size, else docked beside the pages when it's wide, over the pages' edge at medium widths and as a sheet from the bottom on a phone. The frame draws the panel's header (its title, or a switcher in its place, and a close button). A docked panel's inner edge drags it wider or narrower within the panel's `width` (288 px to start, from 200 px to 640 px, never more than half the viewer), and takes the arrow keys, Home and End when it has focus, unless the panel isn't `resizable`; the viewer keeps the width per panel while it runs, from one document to the next, and tells the app each width the user gives it (`onPanelResize` with `{ id, width }`, once a drag ends and on each key; `PanelResizeEvent`). An overlay dims only the pages and closes on a click on them: the bars around the pages keep working while it's open. A sheet slides up over the pages, its handle drags it between half the viewer and nearly all of it or down to close, a flick moves it a whole step, and a tap above it closes it. A panel that holds a list, the thumbnails or the search results, closes from a sheet or an overlay once something in it is picked (`useCloseOnPick`).

  On a phone every menu opens as a sheet from the bottom of the viewer instead of beside its button, and a submenu slides in over the menu it opened from, with a Back row; the arrow keys open and leave it as beside a row. The floating bar with the page number hides while the pages scroll on a phone and comes back once they stop. When the main pointer is a finger, every bar button, document tab, panel header button and menu row is at least 44 px tall, from the viewer's own env, not a media query. Where the viewer reaches the edge of the screen, as in full screen or as a phone app's whole page, it and its sheets keep clear of the notch, the rounded corners and the home bar.

  Sheets and dialogs hold the keyboard: they take focus when they open, keep Tab inside, close on Escape and give focus back to the button that opened them. An overlay takes focus, closes on Escape and gives focus back the same way, but Tab moves on from it to the rest of the viewer: it's a dialog that isn't modal. A docked panel is a region named by its title and never takes focus. The redaction, sign, signature and calibration dialogs open centered over the viewer in the browser's top layer, above a sheet or panel they open from, and Escape cancels them unless they're busy.

  Your own components get the viewer's places by name: a toolbar item is the slot `item:<id>` (it was the bare id), and the regions are `header`, `footer` (new, below everything), `tabs` and `empty` (new, over the pages while no document is open). A slotted toolbar item is measured where it renders, told where it sits as `data-orientation`, `data-edge` (`top`, `bottom`, `start`, `end`, `float` or `selection`), `data-variant` and `data-size`, kept live as its bar moves or the viewer resizes, and its first control is a stop of the toolbar's arrow keys. The viewer draws its own components placed in the page (`<epdf-button>`, `<epdf-menu>`) with its toolbar button and its menus. The zoom field is one Tab stop: its buttons are on the toolbar's arrow keys.

  `plugins` in the viewer's config: a built-in plugin's settings by its name (`stage: { spread: 'odd' }`), merged over the viewer's own, and a plugin of your own as its definition (`analytics: analyticsPlugin()`), which `viewer.get('analytics')` then finds. A name the viewer doesn't know is left out with a warning naming the closest plugin. Settings the viewer's own keys also set only take away: the annotation plugin's `editable` and the form plugin's `fillable` keep only what both they and `disable`/`readOnly` allow, and the commands plugin's `disabledCategories` and `disabledCommands` add to theirs. The engine's fonts come from the delivery's `engine.fonts` (`fonts` on `FullViewer`; `annotations.fonts` is gone): each is read once, registered on a local engine, mounted for the live editor and offered in the style panel, with its family name as its label.

  A `viewer` is done once the viewer it reaches unmounts or mounts again: `createViewer()` returns it with a `dispose()`, after which the listeners and registrations made through it stop, reads and `get()` throw `instance-closed`, and every other call rejects with it. `RenderToken`, `LinkToken`, `PageEditToken` and `ActionsToken` are exported with the other tokens.

  Opening a file is one command, `document:open` (the `documents.open` feature, `Ctrl`/`Cmd`+`O`): **Open** is the first row of the document menu and asks for a PDF, and a PDF dropped on the pages opens too, each as a new tab named after the file. A drop target shows while a PDF is dragged over the pages; other files, dragged text and annotations are left to the page. The command is there only while the engine opens files (`documents.canOpenFiles()`), so a viewer on the cloud engine never offers it and its `Ctrl`/`Cmd`+`O` stays the browser's, and `disable: ['documents.open']` turns off the row, the key and drops together. The tab strip's "+" button and `TabBar`'s `allowOpenFile` prop are gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Commands and shortcuts, as Buttons & commands describes them:
  - A command in `commands` shows its own `label`, and its functions get `get`, which takes a plugin's name (`get('selection')`) or its token, the `viewer` (the one `onReady` gets) and the `documentId`. `CommandDef` and `CommandContext` are the viewer's own types for them.
  - A command with a built-in id merges over the built-in command: what it leaves out stays, so `{ id: 'document:download', run }` keeps Download's label, icon, shortcut and checks. That holds for the `panel:<id>` and `mode:<id>` commands the layout brings too.
  - A shortcut of yours takes its keys from every built-in command that has them, so the key runs your command and the built-in one's tooltip no longer shows it.
  - Keyboard shortcuts reach a viewer only while focus is inside it, or in one of your components slotted into it, so two viewers on a page never both take a key and the page keeps its own keys everywhere else. A press on the pages puts focus inside the viewer.
  - `?` opens a sheet with every shortcut, in groups, in the viewer's language (`help:shortcuts`). Ctrl/Cmd+F opens the search panel, Ctrl/Cmd+O opens a file, Ctrl/Cmd+S downloads, and Delete or Backspace removes the selected annotations.
  - New built-in commands: `page:next`, `page:previous`, `page:first`, `page:last` and `page:go-to` (with `args: { page }`, else a Go to Page dialog), `selection:highlight`, `selection:underline` and `selection:strikeout` (in the bar over selected text), and `redaction:apply` (which asks first). A tool of yours in `plugins.annotation.tools` gets its `tool:<id>` command, labelled and drawn from its `meta` or the tool it extends.
  - The built-in commands ask the plugins' `can*` checks whether the session may run them, instead of naming scope permissions.
  - An icon in `icons` is a path, a list of paths, or `{ paths, fill: true }` to fill them; one with a built-in icon's name replaces it everywhere, the armed tool's cursor included. `IconName` names the viewer's own icons.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A document that couldn't be opened says why, on its pane and on its tab's warning sign: the file wasn't found, the user has no access, it isn't a PDF or is damaged, or this viewer can't open that kind of document. **Try again** next to Close opens it again in the same tab.

  Changes that would be lost are asked about first: closing a tab whose document has changes that weren't downloaded asks before it closes, and leaving the page asks while any document has them. What the app's own code closes doesn't ask.

  The tabs' labels (Close, Loading, an unnamed document) are translated.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Features, as All features, Annotations and Forms & signatures describe them:
  - The settings only the viewer has sit next to their plugin's, in `plugins`: `plugins.stamp.standard` (`true`, the standard stamps from your own build; a URL with `{locale}`; or `false` for none), `plugins.stamp.quick` (stamps shown in the Insert toolbar as `library:name`, `standard` for the standard stamps: `['standard:Approved']`) and `plugins.stamp.sidebar`; `plugins.signature.kinds`, `plugins.signature.fonts` and `plugins.signature.libraries`. The `stamps` and `signatures` keys are gone: `key`, `mode`, `trust` and `allowCertify` are the signature plugin's own settings in `plugins.signature`, and `assetEngine` the stamp plugin's in `plugins.stamp`. `ViewerStampSettings`, `ViewerSignatureSettings` and `SignatureFont` replace `StampsCustomization` and `SignaturesCustomization`.
  - Typed signatures offer three handwriting fonts by default, Allura, Great Vibes and Caveat, each read the first time the signature maker's Type tab opens on it and embedded in the PDF a typed mark goes into. A `plugins.signature.fonts` list replaces them; a font there is a `url` or its `data`. Helvetica and Times are no longer offered for typed marks.
  - A feature's interface isn't part of the first load: the search, comments, style, stamps, signatures, redaction and measurement panels, the signature maker, sign dialog and inspector, the redaction confirmation, the calibration dialog and the link editor are chunks of their own. Once a document shows and the browser is idle, the viewer fetches them in the background, so they still open at once; one opened before that loads right then.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The viewer speaks thirteen languages: English, German, French, Spanish, Italian, Dutch, Portuguese (Brazil), Polish, Japanese, Chinese (Simplified, `zh-CN`), Korean, Arabic and Hebrew. English is in every build; each other language is a chunk of its own that loads the first time the viewer shows it. The eleven languages besides English and Spanish are machine-translated in the terms Adobe Acrobat uses in each language, and are waiting for a native speaker's review. Spanish now calls redaction "Censurar", as Acrobat does.

  In Arabic and Hebrew the viewer reads right to left: the bars mirror, `start` and `end` swap sides, and the zoom field, the search panel, menus and panels lay out from the right. A language you add through `strings` reads right to left when its code says so (`fa`, `ur`, `ku-Arab`), and is named in itself (`sv` is "svenska") where the browser knows the language. A `strings` code matches the viewer's own languages in any case (`zh-cn` is `zh-CN`).

  A built-in button's label has its command's id as its key in `strings`, per language: `strings: { de: { 'document:download': 'Kopie speichern' } }` relabels that one button in German, and a language with no string for the id keeps its own label. The zoom field's buttons take their commands' labels, and the search panel's previous and next buttons are translated.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The viewer's look is the public `--epdf-*` variables: `--epdf-accent`, `--epdf-background`, `--epdf-surface`, `--epdf-surface-raised`, `--epdf-text`, `--epdf-text-muted`, `--epdf-border`, `--epdf-hover`, `--epdf-canvas`, `--epdf-radius` and `--epdf-font`. The stylesheet declares each on the viewer's root with a default for light and for dark, and mixes every other shade from them, so the chrome's hover, pressed, tinted and secondary colors and its corners follow them. A value the page sets on the viewer or around it wins over the config and the defaults, and your own components in the viewer can use every one. The chrome's own `--ep-*` variables are gone.

  `theme` takes `accent` next to `preference`, `tokens` and `dark`, and `tokens` and `dark` take the token names above (`THEME_TOKENS`, typed as `ThemeTokens`); another name warns and is ignored. `themeTokenCss()` turns a theme into the CSS a delivery applies on the viewer's root, in place of `themeTokenProperty()`.

  Every bar is the `toolbar` part: the bars along the edges, a floating bar's pill and the bars over selected text and a selected annotation. Every button in a bar is `toolbar-button` (with `toolbar-button-active` while it's pressed or its menu is open): the zoom field's buttons, "More", a folded group's button and the bars over a selection's buttons too. The chevron the mode tabs fold behind is a `mode-tab`, `mode-tab-active` while the open mode is behind it.

  The bar over selected text and the bar over a selected annotation sit above it, and below it when there's no room above; on a touch screen the text's bar keeps clear of the selection handles. A menu from either opens on the side the bar sits, away from the selection.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The viewer has the metadata plugin: `viewer.get('metadata')` is the document's title, author and custom fields, read the first time something asks (`await viewer.get('metadata').ensureLoaded()`, or `useMetadataState()` in your components), never as a document opens.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The viewer uses the annotation plugin's nouns and hooks: the style panel and the flags read `useAnnotationProperties()`, the comments panel asks a check per verb, and the menus come from `@embedpdf/react/annotation`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The inert placeholder `signature` tool is removed; the signature button opens the signatures panel.

  Annotation editors, tool defaults, sidebars, and page controls use the engine's updated kind-specific annotation fields and page-space geometry. Forms, search, and signature controls follow the revised document API.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The light and dark themes set EmbedPDF's theming variables (`--epdf-accent`, `--epdf-scrollbar-thumb`, `--epdf-toolbar-*`), and the chrome's accent is `--epdf-accent`, with its hover, pressed and tinted shades mixed from it: one variable themes the pages and the chrome. The theme token `accent` sets `--epdf-accent`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Follows the documents, interaction and stage contracts (`documents.save`, `getActiveToolId`, `getCurrentPage`, `revealIndex`, `rotateViewBy`, `getSettings`); page controls count pages from the page registry. Annotation UI reads the page-space records (`listSelected`, `raw` for engine-only fields), the comments panel uses the renamed comment verbs and `useAnnotationStatus`. Widget deletion resolves fields through `getFieldForWidget` and deletes by ref; the signature inspector reads the fill feed through `FormHostToken`. Stamp and signature panels use the renamed stamp verbs; library export is asynchronous. `ViewerHandle` gains `on(event, listener)` over the document lifecycle events (`opened`, `openFailed`, `locked`, `closed`, `activeChanged`, `pagesChanged`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Follows the documents capability: the download command calls `documents.download()`, which runs the document's save actions itself, the download and print commands read `canDownload()` and `canPrint()`, and the tab bar and document panes read `useDocumentsState()`. `DocumentInfo` is exported (was `DocInfo`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The viewer paints form fields at rest again: the page picture leaves out only what the annotation and form layers paint. The sign dialog offers signing and drawing per field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The signature inspector anchors at the signature widget's row in the form.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The viewer fills forms through `<FormLayer>` above its `<AnnotationLayer>`, and its signature panel and inspector read `useSignatureState()`; the inspector anchors at the signed field's own box.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Toolbar menus and the style panel's dropdowns also close on a press on the page around the viewer. The page's `--epdf-accent`, `--epdf-scrollbar-thumb` and `--epdf-toolbar-*` win over the chrome's defaults in light and in dark, whether set on the viewer or on an element around it; with none set, the chrome's defaults also reach the parts drawn on the pages, so both agree.

  The viewer handle carries the viewer's kernel for the framework wrappers, under a registered symbol. It is not part of the handle's API.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Reads the active tool with `useInteractionState()` and the open menus with `useShellState()`, replacing the removed `useTool()` and `useMenus()`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Ctrl/Cmd+C and Edit → Copy reach a viewer only while focus is inside it, like its other shortcuts: with two viewers on a page only the one focus is in copies its selected text, and the page keeps its own copying everywhere else.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Fix the Measure scale panel freezing the viewer when opened.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Commands, the link editor, the signature inspector and the measurement panel address pages by `PageRef`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A document's scripts ask who the user is and get the document's user, from the viewer's identity or the token, instead of a fixed name.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The search panel reads its matches with `useSearchHits()` and the active match from `useSearchState().activeHitIndex`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The stamps, signatures, measurement and redaction panels read the plugins' state hooks (`useStampState`, `useMeasurementState`, `useRedactionState`) and arm stamps with `useStamp().armAsset()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The square, circle, line and arrow tools show their ghost.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The thumbnail rail registers its view with `interaction: false` and `zoomGestures: false`, and the page controls read the Stage's state hook. Spread and scroll commands change the Stage through `updateSettings()`, and "Go to link" follows the link through `activate()`, which opens a website itself.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add a Measure toolbar with distance drawing, a scale sidebar, and known-length calibration controls. Support Escape to cancel an unfinished drawing, with English and Spanish labels.

  Use distinct calibration and scale-setting icons that inherit the viewer's theme and active-state colors.

  Add Perimeter and Area tools, dynamic stroke-colored measurement icons across toolbar and cursor, separate area-unit controls, selected area/perimeter readouts, and a reset-label-position action.

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
