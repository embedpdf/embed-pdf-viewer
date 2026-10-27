# @embedpdf/viewer-vue

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/viewer-vue/component` is the wrapper's door-blind parts (the viewer's setup and options at the widest config, the slots, components and composables), so a door in another package, such as `@cloudpdf/viewer-vue`, defines the same `<PDFViewer>` with its own config.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Vue wrapper for the full viewer. `<PDFViewer>` renders the `<embedpdf-viewer>` element with every config key as a prop (or a whole config with `v-bind="config"`), and the callbacks as events: `@ready`, `@document-change` and `@panel-resize`, which reach the handler you give at the time. `src`, `theme`, `locale`, `disable` and `readOnly` follow their props on the running viewer, compared by value; any other key is read once, and a change warns once in development (a new `key` mounts a new viewer). `<PDFViewer read-only />` is read-only, as a boolean prop. A template ref on `<PDFViewer>` reads the element as `elementRef`; `class`, `style` and other attributes go on the element.

  `ToolbarItem`, `Panel` and `Region` put your Vue components in the viewer, where they stay in your app: what they provide and inject, their state and your CSS. `useToolbarItem()` gives a component in a `ToolbarItem` a reactive `orientation`, `edge`, `variant` and `size`, following the bar it sits in. `Button`, `Menu` and `MenuItem` (`@select`) are the viewer's own components. Inside the viewer, `usePDFViewer()` gives the `viewer`, `useCommand(id)` a command as a button needs it, and every headless composable of `@embedpdf/vue` reads the viewer's own kernel. The main entry brings the built-in engine; `@embedpdf/viewer-vue/core` takes your own and leaves PDFium out of the build. Both are safe to import and render on the server (Nuxt), where the component renders the empty element.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<PDFViewer>` drops its `stamps` and `signatures` props: the viewer takes those settings in `plugins.stamp` and `plugins.signature`.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `PDFViewerPropsOf<Config>` takes any door's config, also one that names its documents in its own words, as the CloudPDF wrapper's does.
