<!-- Generated from docs/content/headless/quick-start.mdx and docs/content/headless/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/vue

Vue 3 components and composables for building your own PDF viewer with EmbedPDF.

## Quick start

This guide builds a small PDF viewer: the pages, text people can select, zoom buttons, a
highlighter and a save button. Each step adds one plugin or one control, so you can stop at any
step and have a working viewer.

### 1. Install

You need two packages: the one for your framework, and an engine.

```sh
npm install @embedpdf/vue @embedpdf/engine
```

Every feature is a separate import from the framework package, such as `@embedpdf/vue/stage`,
so what you don't use never reaches your bundle.

### 2. Show a PDF

Create the engine once, then give it to `<Viewer>` with the plugins you want and the document to
open. `<Stage>` shows the pages, and `<RenderLayer>` draws each one:

**`App.vue`**

```vue
<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';

// The engine is created synchronously and costs nothing until first use, so
// a module-level `const engine = …` is safe, even with server-side rendering.
// Only opening a document does real work: the UI renders at once.
const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// The local engine opens bytes: fetch lazily, under the loading tab.
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <div style="height: 500px">
      <!-- Document UI is defined over a document: gate it on having one. -->
      <DocumentGate>
        <template #fallback><p>Loading…</p></template>
        <Stage style="height: 100%">
          <template #page><RenderLayer /></template>
        </Stage>
      </DocumentGate>
    </div>
  </Viewer>
</template>
```

`localEngine()` costs nothing until it's used, so creating it at the top of a module is safe, even
with server-side rendering. The viewer starts it when it mounts: PDFium boots in a Web Worker in
the background, and the first page shows as soon as the document is open. The engine's
WebAssembly is part of your build and loads from your own site; see [Setup](https://www.embedpdf.com/docs/headless/vue/setup).

`<DocumentGate>` shows its `fallback` until the document is open, so the Stage never renders
without one.

## Every plugin

Each plugin is one import line. Registering a plugin and importing its components come from the
same place:

| Plugin                                                                              | What it gives you                                                       | Import from                  |
| :---------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------- |
| [Stage](https://www.embedpdf.com/docs/headless/vue/viewing/stage)                   | Scrolling, zoom, layouts, page navigation                               | `@embedpdf/vue/stage`        |
| [Render](https://www.embedpdf.com/docs/headless/vue/viewing/render)                 | Sharp pages at every zoom, deep-zoom tiles                              | `@embedpdf/vue/render`       |
| [Links](https://www.embedpdf.com/docs/headless/vue/viewing/links)                   | Clickable links to pages and websites                                   | `@embedpdf/vue/link`         |
| [Selection](https://www.embedpdf.com/docs/headless/vue/text/selection)              | Selecting and copying text                                              | `@embedpdf/vue/selection`    |
| [Search](https://www.embedpdf.com/docs/headless/vue/text/search)                    | Finding text, and showing every match                                   | `@embedpdf/vue/search`       |
| [Annotations](https://www.embedpdf.com/docs/headless/vue/annotations)               | Highlights, notes, shapes, free text, and your own tools                | `@embedpdf/vue/annotation`   |
| [Stamps](https://www.embedpdf.com/docs/headless/vue/annotations/stamps)             | Libraries of stamps, placed by click or by code                         | `@embedpdf/vue/stamp`        |
| [Measurements](https://www.embedpdf.com/docs/headless/vue/annotations/measurements) | Distances, perimeters and areas at a real scale                         | `@embedpdf/vue/measurement`  |
| [Redaction](https://www.embedpdf.com/docs/headless/vue/annotations/redaction)       | Removing content for good                                               | `@embedpdf/vue/redaction`    |
| [Forms](https://www.embedpdf.com/docs/headless/vue/forms)                           | Filling and building PDF forms                                          | `@embedpdf/vue/form`         |
| [Signatures](https://www.embedpdf.com/docs/headless/vue/forms/signatures)           | Signing documents and checking signatures                               | `@embedpdf/vue/signature`    |
| [Page edit](https://www.embedpdf.com/docs/headless/vue/documents/pages)             | Rotating, reordering, inserting and deleting pages                      | `@embedpdf/vue/page-edit`    |
| [Metadata](https://www.embedpdf.com/docs/headless/vue/documents/metadata)           | A document's title, author and your own fields                          | `@embedpdf/vue/metadata`     |
| [Fonts](https://www.embedpdf.com/docs/headless/vue/documents/fonts)                 | The fonts a document can be written in, drawn as the engine writes them | `@embedpdf/vue/fonts`        |
| [Outline](https://www.embedpdf.com/docs/headless/vue/documents/outline)             | A document's outline (its bookmarks), to show, follow and edit          | `@embedpdf/vue/outline`      |
| [Attachments](https://www.embedpdf.com/docs/headless/vue/documents/attachments)     | The files a PDF carries: listing, saving, attaching and removing them   | `@embedpdf/vue/attachment`   |
| [Actions](https://www.embedpdf.com/docs/headless/vue/documents/actions)             | What a PDF does by itself: buttons, scripts, printing                   | `@embedpdf/vue/actions`      |
| [View manager](https://www.embedpdf.com/docs/headless/vue/documents/tabs)           | Several documents side by side                                          | `@embedpdf/vue/view-manager` |
| [Interaction](https://www.embedpdf.com/docs/headless/vue/ui/tools)                  | The active tool, cursors and touch                                      | `@embedpdf/vue/interaction`  |
| [Commands](https://www.embedpdf.com/docs/headless/vue/ui/commands)                  | Named actions with labels, icons and shortcuts                          | `@embedpdf/vue/commands`     |
| [Shell](https://www.embedpdf.com/docs/headless/vue/ui/panels)                       | Which panels, dialogs and menus are open                                | `@embedpdf/vue/shell`        |
| [Translations](https://www.embedpdf.com/docs/headless/vue/ui/translations)          | Your UI in the user's language                                          | `@embedpdf/vue/i18n`         |

## Documentation

- [Quick start](https://www.embedpdf.com/docs/headless/vue/quick-start): Build a PDF viewer step by step, with text selection, zoom buttons, a highlighter and a save button.
- [Setup](https://www.embedpdf.com/docs/headless/vue/setup): Server-side rendering, bundlers, fonts, and hosting the engine yourself.
- [How it works](https://www.embedpdf.com/docs/headless/vue/concepts/how-it-works): Plugins, how your UI talks to them, layers, and which document a component talks to.
- [Scroll, zoom & layout](https://www.embedpdf.com/docs/headless/vue/viewing/stage): Layouts, zoom modes, page navigation and touch.

## License

Apache-2.0
