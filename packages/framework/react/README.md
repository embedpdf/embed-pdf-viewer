<!-- Generated from docs/content/headless/quick-start.mdx and docs/content/headless/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/react

React components and hooks for building your own PDF viewer with EmbedPDF.

## Quick start

This guide builds a small PDF viewer: the pages, text people can select, zoom buttons, a
highlighter and a save button. Each step adds one plugin or one control, so you can stop at any
step and have a working viewer.

### 1. Install

You need two packages: the one for your framework, and an engine.

```sh
npm install @embedpdf/react @embedpdf/engine
```

Every feature is a separate import from the framework package, such as `@embedpdf/react/stage`,
so what you don't use never reaches your bundle.

### 2. Show a PDF

Create the engine once, then give it to `<Viewer>` with the plugins you want and the document to
open. `<Stage>` shows the pages, and `<RenderLayer>` draws each one:

**`basic.tsx`**

```tsx
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
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

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <div style={{ height: 500 }}>
        {/* Document UI is defined over a document: gate it on having one. */}
        <DocumentGate fallback={<p>Loading…</p>}>
          <Stage style={{ height: '100%' }}>{() => <RenderLayer />}</Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}
```

`localEngine()` costs nothing until it's used, so creating it at the top of a module is safe, even
with server-side rendering. The viewer starts it when it mounts: PDFium boots in a Web Worker in
the background, and the first page shows as soon as the document is open. The engine's
WebAssembly is part of your build and loads from your own site; see [Setup](https://www.embedpdf.com/docs/headless/react/setup).

`<DocumentGate>` shows its `fallback` until the document is open, so the Stage never renders
without one.

## Every plugin

Each plugin is one import line. Registering a plugin and importing its components come from the
same place:

| Plugin                                                                                | What it gives you                                                       | Import from                    |
| :------------------------------------------------------------------------------------ | :---------------------------------------------------------------------- | :----------------------------- |
| [Stage](https://www.embedpdf.com/docs/headless/react/viewing/stage)                   | Scrolling, zoom, layouts, page navigation                               | `@embedpdf/react/stage`        |
| [Render](https://www.embedpdf.com/docs/headless/react/viewing/render)                 | Sharp pages at every zoom, deep-zoom tiles                              | `@embedpdf/react/render`       |
| [Links](https://www.embedpdf.com/docs/headless/react/viewing/links)                   | Clickable links to pages and websites                                   | `@embedpdf/react/link`         |
| [Selection](https://www.embedpdf.com/docs/headless/react/text/selection)              | Selecting and copying text                                              | `@embedpdf/react/selection`    |
| [Search](https://www.embedpdf.com/docs/headless/react/text/search)                    | Finding text, and showing every match                                   | `@embedpdf/react/search`       |
| [Annotations](https://www.embedpdf.com/docs/headless/react/annotations)               | Highlights, notes, shapes, free text, and your own tools                | `@embedpdf/react/annotation`   |
| [Stamps](https://www.embedpdf.com/docs/headless/react/annotations/stamps)             | Libraries of stamps, placed by click or by code                         | `@embedpdf/react/stamp`        |
| [Measurements](https://www.embedpdf.com/docs/headless/react/annotations/measurements) | Distances, perimeters and areas at a real scale                         | `@embedpdf/react/measurement`  |
| [Redaction](https://www.embedpdf.com/docs/headless/react/annotations/redaction)       | Removing content for good                                               | `@embedpdf/react/redaction`    |
| [Forms](https://www.embedpdf.com/docs/headless/react/forms)                           | Filling and building PDF forms                                          | `@embedpdf/react/form`         |
| [Signatures](https://www.embedpdf.com/docs/headless/react/forms/signatures)           | Signing documents and checking signatures                               | `@embedpdf/react/signature`    |
| [Page edit](https://www.embedpdf.com/docs/headless/react/documents/pages)             | Rotating, reordering, inserting and deleting pages                      | `@embedpdf/react/page-edit`    |
| [Metadata](https://www.embedpdf.com/docs/headless/react/documents/metadata)           | A document's title, author and your own fields                          | `@embedpdf/react/metadata`     |
| [Fonts](https://www.embedpdf.com/docs/headless/react/documents/fonts)                 | The fonts a document can be written in, drawn as the engine writes them | `@embedpdf/react/fonts`        |
| [Outline](https://www.embedpdf.com/docs/headless/react/documents/outline)             | A document's outline (its bookmarks), to show, follow and edit          | `@embedpdf/react/outline`      |
| [Attachments](https://www.embedpdf.com/docs/headless/react/documents/attachments)     | The files a PDF carries: listing, saving, attaching and removing them   | `@embedpdf/react/attachment`   |
| [Actions](https://www.embedpdf.com/docs/headless/react/documents/actions)             | What a PDF does by itself: buttons, scripts, printing                   | `@embedpdf/react/actions`      |
| [View manager](https://www.embedpdf.com/docs/headless/react/documents/tabs)           | Several documents side by side                                          | `@embedpdf/react/view-manager` |
| [Interaction](https://www.embedpdf.com/docs/headless/react/ui/tools)                  | The active tool, cursors and touch                                      | `@embedpdf/react/interaction`  |
| [Commands](https://www.embedpdf.com/docs/headless/react/ui/commands)                  | Named actions with labels, icons and shortcuts                          | `@embedpdf/react/commands`     |
| [Shell](https://www.embedpdf.com/docs/headless/react/ui/panels)                       | Which panels, dialogs and menus are open                                | `@embedpdf/react/shell`        |
| [Translations](https://www.embedpdf.com/docs/headless/react/ui/translations)          | Your UI in the user's language                                          | `@embedpdf/react/i18n`         |

## Documentation

- [Quick start](https://www.embedpdf.com/docs/headless/react/quick-start): Build a PDF viewer step by step, with text selection, zoom buttons, a highlighter and a save button.
- [Setup](https://www.embedpdf.com/docs/headless/react/setup): Server-side rendering, bundlers, fonts, and hosting the engine yourself.
- [How it works](https://www.embedpdf.com/docs/headless/react/concepts/how-it-works): Plugins, how your UI talks to them, layers, and which document a component talks to.
- [Scroll, zoom & layout](https://www.embedpdf.com/docs/headless/react/viewing/stage): Layouts, zoom modes, page navigation and touch.

## License

Apache-2.0
