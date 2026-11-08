# @embedpdf/viewer-svelte

## 3.1.0

### Minor Changes

- [#1027](https://github.com/embedpdf/embed-pdf-viewer/pull/1027) by [@bobsingor](https://github.com/bobsingor) – The viewer takes a `features` prop, which it follows while it runs: what people can do, a feature or a
  part on or off (`features={{ measurement: true }}`). Measuring, redaction, building forms and snapshots now start off until
  `features` turns them on. `disable` is deprecated and goes in 4.0.

## 3.0.0

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` takes `appState`, your app's state, which your commands read; it follows its prop, and the commands' buttons with it.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/viewer-svelte/component` is the wrapper's door-blind parts (`<PDFViewer>` at the widest config, the slots, components and hooks), so a door in another package, such as `@cloudpdf/viewer-svelte`, narrows the same component to its own config.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer fetch>`: your own `fetch` for documents at a URL, to add headers or cookies. It follows its prop, like `src`.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `Button` and `MenuItem` take `active`: shown pressed, or checked, as a command's button or row is while its command is active, for a toggle of your own (a theme switch). `Icon` draws one of the viewer's icons, or one of yours (`icons`), in the color of the text around it: `name`, `size` (default 20) and `label` for screen readers.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Svelte wrapper for the full viewer. `<PDFViewer>` renders the `<embedpdf-viewer>` element with every config key as a prop (or a whole config with `{...config}`), and the callbacks as props under their Svelte names: `onready`, `ondocumentchange` and `onpanelresize`, which call the handler you give at the time. `src`, `theme`, `locale`, `disable` and `readOnly` follow their props on the running viewer, compared by value; any other key is read once, and a change warns once in development (a `{#key}` block mounts a new viewer). `bind:element` gives the element; `class` and `style` go on it.

  `ToolbarItem`, `Panel` and `Region` put your Svelte components in the viewer, where they stay in your app: their context, their state and your CSS. `useToolbarItem()` gives a component in a `ToolbarItem` a reactive `orientation`, `edge`, `variant` and `size`, following the bar it sits in. `Button`, `Menu` and `MenuItem` (`onselect`) are the viewer's own components. Inside the viewer, `usePDFViewer()` gives the `viewer`, `useCommand(id)` a command as a button needs it, and every headless function of `@embedpdf/svelte` reads the viewer's own kernel. The main entry brings the built-in engine; `@embedpdf/viewer-svelte/core` takes your own and leaves PDFium out of the build. Both are safe to import and render on the server (SvelteKit), where the component renders the empty element.

### Patch Changes

- [#938](https://github.com/embedpdf/embed-pdf-viewer/pull/938) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer appState>` follows its prop: a new value reaches the running viewer, and its commands
  read it. Before, only the first one did: Svelte spread it onto the element as an `appstate`
  attribute.

## 3.0.0-next.23

## 3.0.0-next.22

## 3.0.0-next.21

## 3.0.0-next.20

### Minor Changes

- [#948](https://github.com/embedpdf/embed-pdf-viewer/pull/948) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` takes `appState`, your app's state, which your commands read; it follows its prop, and the commands' buttons with it.

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – `Button` and `MenuItem` take `active`: shown pressed, or checked, as a command's button or row is while its command is active, for a toggle of your own (a theme switch). `Icon` draws one of the viewer's icons, or one of yours (`icons`), in the color of the text around it: `name`, `size` (default 20) and `label` for screen readers.

### Patch Changes

- [#938](https://github.com/embedpdf/embed-pdf-viewer/pull/938) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer appState>` follows its prop: a new value reaches the running viewer, and its commands
  read it. Before, only the first one did: Svelte spread it onto the element as an `appstate`
  attribute.

## 3.0.0-next.19

### Minor Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer fetch>`: your own `fetch` for documents at a URL, to add headers or cookies. It follows its prop, like `src`.

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/viewer-svelte/component` is the wrapper's door-blind parts (`<PDFViewer>` at the widest config, the slots, components and hooks), so a door in another package, such as `@cloudpdf/viewer-svelte`, narrows the same component to its own config.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Svelte wrapper for the full viewer. `<PDFViewer>` renders the `<embedpdf-viewer>` element with every config key as a prop (or a whole config with `{...config}`), and the callbacks as props under their Svelte names: `onready`, `ondocumentchange` and `onpanelresize`, which call the handler you give at the time. `src`, `theme`, `locale`, `disable` and `readOnly` follow their props on the running viewer, compared by value; any other key is read once, and a change warns once in development (a `{#key}` block mounts a new viewer). `bind:element` gives the element; `class` and `style` go on it.

  `ToolbarItem`, `Panel` and `Region` put your Svelte components in the viewer, where they stay in your app: their context, their state and your CSS. `useToolbarItem()` gives a component in a `ToolbarItem` a reactive `orientation`, `edge`, `variant` and `size`, following the bar it sits in. `Button`, `Menu` and `MenuItem` (`onselect`) are the viewer's own components. Inside the viewer, `usePDFViewer()` gives the `viewer`, `useCommand(id)` a command as a button needs it, and every headless function of `@embedpdf/svelte` reads the viewer's own kernel. The main entry brings the built-in engine; `@embedpdf/viewer-svelte/core` takes your own and leaves PDFium out of the build. Both are safe to import and render on the server (SvelteKit), where the component renders the empty element.
