# @embedpdf/viewer-vue

The full EmbedPDF viewer as a Vue component: a thin wrapper around the
`<embedpdf-viewer>` custom element from [`@embedpdf/viewer`](https://www.npmjs.com/package/@embedpdf/viewer).

```bash
npm install @embedpdf/viewer-vue
```

```vue
<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
</script>

<template>
  <PDFViewer src="/report.pdf" style="height: 100vh" />
</template>
```

No engine or wasm configuration is needed: the built-in local engine (PDFium
compiled to WebAssembly, running in a Web Worker) is the default, and your
bundler ships `embedpdf.wasm` inside your own build. Self-hosting, strict-CSP
worker delivery, and injecting a different engine implementation are all
available through the `engine` prop — see the docs.

## Your own components

`ToolbarItem`, `Panel` and `Region` put your component in the place the layout
makes for it, while it stays in **your** Vue app — your provides, your state,
your CSS:

```vue
<script setup lang="ts">
import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-vue';
import DocPicker from './DocPicker.vue';

const layout = (layout: Layout) => layout.add({ custom: 'doc-picker' }, { to: 'main', section: 'start' });
</script>

<template>
  <PDFViewer src="/report.pdf" :layout="layout">
    <ToolbarItem id="doc-picker"><DocPicker /></ToolbarItem>
  </PDFViewer>
</template>
```

`useToolbarItem()` tells it where it sits, and `Button`, `Menu` and `MenuItem`
are the viewer's own, for yours.

## Driving the viewer

```vue
<PDFViewer src="/report.pdf" @ready="(viewer) => viewer.commands.execute('zoom:in')" />
```

`@ready` hands you the `viewer`: each plugin's API by its name
(`viewer.get('search')`, or its token), `viewer.documents`, `viewer.commands`
and the `watch` reactivity primitive. Inside the viewer, a component of yours
gets it with `usePDFViewer()`, and `useCommand(id)` gives it a command as a
button needs it (label, icon, shortcut, state and `run()`). The headless
composables of `@embedpdf/vue` work there too. `@document-change` and
`@panel-resize` say when the active document changes and when someone resizes
a panel. When the viewer unmounts, its `viewer` is done: its listeners stop and
its calls refuse.

`src`, `theme`, `locale`, `disable`, `readOnly` and `fetch` follow their props
while the viewer runs; every other prop is read once, so give the viewer a new `key` to
start over with a changed one.

## Server-side rendering

Safe to import and render on the server (Nuxt included, no `<ClientOnly>`):
`<PDFViewer>` renders the empty `<embedpdf-viewer>` element, and the viewer
starts in the browser.

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
