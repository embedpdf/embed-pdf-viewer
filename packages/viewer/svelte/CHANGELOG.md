# @embedpdf/viewer-svelte

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/viewer-svelte/component` is the wrapper's door-blind parts (`<PDFViewer>` at the widest config, the slots, components and hooks), so a door in another package, such as `@cloudpdf/viewer-svelte`, narrows the same component to its own config.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Svelte wrapper for the full viewer. `<PDFViewer>` renders the `<embedpdf-viewer>` element with every config key as a prop (or a whole config with `{...config}`), and the callbacks as props under their Svelte names: `onready`, `ondocumentchange` and `onpanelresize`, which call the handler you give at the time. `src`, `theme`, `locale`, `disable` and `readOnly` follow their props on the running viewer, compared by value; any other key is read once, and a change warns once in development (a `{#key}` block mounts a new viewer). `bind:element` gives the element; `class` and `style` go on it.

  `ToolbarItem`, `Panel` and `Region` put your Svelte components in the viewer, where they stay in your app: their context, their state and your CSS. `useToolbarItem()` gives a component in a `ToolbarItem` a reactive `orientation`, `edge`, `variant` and `size`, following the bar it sits in. `Button`, `Menu` and `MenuItem` (`onselect`) are the viewer's own components. Inside the viewer, `usePDFViewer()` gives the `viewer`, `useCommand(id)` a command as a button needs it, and every headless function of `@embedpdf/svelte` reads the viewer's own kernel. The main entry brings the built-in engine; `@embedpdf/viewer-svelte/core` takes your own and leaves PDFium out of the build. Both are safe to import and render on the server (SvelteKit), where the component renders the empty element.
