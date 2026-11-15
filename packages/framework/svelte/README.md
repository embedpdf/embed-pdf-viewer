<!-- Generated from docs/content/headless/quick-start.mdx and docs/content/headless/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/svelte

Svelte 5 components and functions for building your own PDF viewer with EmbedPDF.

## Quick start

This guide builds a small PDF viewer: the pages, text people can select, zoom buttons, a
highlighter and a save button. Each step adds one plugin or one control, so you can stop at any
step and have a working viewer.

### 1. Install

You need two packages: the one for your framework, and an engine.

```sh
npm install @embedpdf/svelte @embedpdf/engine
```

Every feature is a separate import from the framework package, such as `@embedpdf/svelte/stage`,
so what you don't use never reaches your bundle.

### 2. Show a PDF

Create the engine once, then give it to `<Viewer>` with the plugins you want and the document to
open. `<Stage>` shows the pages, and `<RenderLayer>` draws each one:

**`App.svelte`**

```svelte
<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { localEngine } from '@embedpdf/engine';

  // The engine is created synchronously and costs nothing until first use, so
  // a module-scope `const engine = …` is safe, even under SSR. Only opening a
  // document does real work: the UI renders at t≈0.
  const engine = localEngine();
  const plugins = [stagePlugin(), renderPlugin()];

  // The local engine opens bytes: fetch lazily, under the loading tab.
  const welcome = async (): Promise<OpenInput> => {
    const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
    return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: welcome }]}>
  <div style="height: 500px">
    <!-- Document UI is defined over a document: gate it on having one. -->
    <DocumentGate>
      {#snippet fallback()}
        <p>Loading…</p>
      {/snippet}
      <Stage style="height: 100%">
        <RenderLayer />
      </Stage>
    </DocumentGate>
  </div>
</Viewer>
```

`localEngine()` costs nothing until it's used, so creating it at the top of a module is safe, even
with server-side rendering. The viewer starts it when it mounts: PDFium boots in a Web Worker in
the background, and the first page shows as soon as the document is open. The engine's
WebAssembly is part of your build and loads from your own site; see [Setup](https://www.embedpdf.com/docs/headless/svelte/setup).

`<DocumentGate>` shows its `fallback` until the document is open, so the Stage never renders
without one.

## Every plugin

Each plugin is one import line. Registering a plugin and importing its components come from the
same place:

| Plugin                                                                                 | What it gives you                                                       | Import from                     |
| :------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------ |
| [Stage](https://www.embedpdf.com/docs/headless/svelte/viewing/stage)                   | Scrolling, zoom, layouts, page navigation                               | `@embedpdf/svelte/stage`        |
| [Render](https://www.embedpdf.com/docs/headless/svelte/viewing/render)                 | Sharp pages at every zoom, deep-zoom tiles                              | `@embedpdf/svelte/render`       |
| [Links](https://www.embedpdf.com/docs/headless/svelte/viewing/links)                   | Clickable links to pages and websites                                   | `@embedpdf/svelte/link`         |
| [Selection](https://www.embedpdf.com/docs/headless/svelte/text/selection)              | Selecting and copying text                                              | `@embedpdf/svelte/selection`    |
| [Search](https://www.embedpdf.com/docs/headless/svelte/text/search)                    | Finding text, and showing every match                                   | `@embedpdf/svelte/search`       |
| [Annotations](https://www.embedpdf.com/docs/headless/svelte/annotations)               | Highlights, notes, shapes, free text, and your own tools                | `@embedpdf/svelte/annotation`   |
| [Stamps](https://www.embedpdf.com/docs/headless/svelte/annotations/stamps)             | Libraries of stamps, placed by click or by code                         | `@embedpdf/svelte/stamp`        |
| [Measurements](https://www.embedpdf.com/docs/headless/svelte/annotations/measurements) | Distances, perimeters and areas at a real scale                         | `@embedpdf/svelte/measurement`  |
| [Redaction](https://www.embedpdf.com/docs/headless/svelte/annotations/redaction)       | Removing content for good                                               | `@embedpdf/svelte/redaction`    |
| [Forms](https://www.embedpdf.com/docs/headless/svelte/forms)                           | Filling and building PDF forms                                          | `@embedpdf/svelte/form`         |
| [Signatures](https://www.embedpdf.com/docs/headless/svelte/forms/signatures)           | Signing documents and checking signatures                               | `@embedpdf/svelte/signature`    |
| [Page edit](https://www.embedpdf.com/docs/headless/svelte/documents/pages)             | Rotating, reordering, inserting and deleting pages                      | `@embedpdf/svelte/page-edit`    |
| [Metadata](https://www.embedpdf.com/docs/headless/svelte/documents/metadata)           | A document's title, author and your own fields                          | `@embedpdf/svelte/metadata`     |
| [Fonts](https://www.embedpdf.com/docs/headless/svelte/documents/fonts)                 | The fonts a document can be written in, drawn as the engine writes them | `@embedpdf/svelte/fonts`        |
| [Outline](https://www.embedpdf.com/docs/headless/svelte/documents/outline)             | A document's outline (its bookmarks), to show, follow and edit          | `@embedpdf/svelte/outline`      |
| [Attachments](https://www.embedpdf.com/docs/headless/svelte/documents/attachments)     | The files a PDF carries: listing, saving, attaching and removing them   | `@embedpdf/svelte/attachment`   |
| [Actions](https://www.embedpdf.com/docs/headless/svelte/documents/actions)             | What a PDF does by itself: buttons, scripts, printing                   | `@embedpdf/svelte/actions`      |
| [View manager](https://www.embedpdf.com/docs/headless/svelte/documents/tabs)           | Several documents side by side                                          | `@embedpdf/svelte/view-manager` |
| [Interaction](https://www.embedpdf.com/docs/headless/svelte/ui/tools)                  | The active tool, cursors and touch                                      | `@embedpdf/svelte/interaction`  |
| [Commands](https://www.embedpdf.com/docs/headless/svelte/ui/commands)                  | Named actions with labels, icons and shortcuts                          | `@embedpdf/svelte/commands`     |
| [Shell](https://www.embedpdf.com/docs/headless/svelte/ui/panels)                       | Which panels, dialogs and menus are open                                | `@embedpdf/svelte/shell`        |
| [Translations](https://www.embedpdf.com/docs/headless/svelte/ui/translations)          | Your UI in the user's language                                          | `@embedpdf/svelte/i18n`         |

## Documentation

- [Quick start](https://www.embedpdf.com/docs/headless/svelte/quick-start): Build a PDF viewer step by step, with text selection, zoom buttons, a highlighter and a save button.
- [Setup](https://www.embedpdf.com/docs/headless/svelte/setup): Server-side rendering, bundlers, fonts, and hosting the engine yourself.
- [How it works](https://www.embedpdf.com/docs/headless/svelte/concepts/how-it-works): Plugins, how your UI talks to them, layers, and which document a component talks to.
- [Scroll, zoom & layout](https://www.embedpdf.com/docs/headless/svelte/viewing/stage): Layouts, zoom modes, page navigation and touch.

## License

Apache-2.0
