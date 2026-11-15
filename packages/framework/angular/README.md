<!-- Generated from docs/content/headless/quick-start.mdx and docs/content/headless/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/angular

Angular services and components for building your own PDF viewer with EmbedPDF.

## Quick start

This guide builds a small PDF viewer: the pages, text people can select, zoom buttons, a
highlighter and a save button. Each step adds one plugin or one control, so you can stop at any
step and have a working viewer.

### 1. Install

You need two packages: the one for your framework, and an engine.

```sh
npm install @embedpdf/angular @embedpdf/engine
```

Every feature is a separate import from the framework package, such as `@embedpdf/angular/stage`,
so what you don't use never reaches your bundle.

### 2. Show a PDF

Create the engine once, then give it to `provideEmbedPdf()` with the plugins you want and the document to
open. `<epdf-stage>` shows the pages, and `<epdf-render-layer>` draws each one:

**`basic.ts`**

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

// The local engine opens bytes: fetch lazily, under the loading tab.
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The component that provides the viewer renders it: the engine is created in the browser,
// and costs nothing until the first document opens, so the page renders at once.
@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: welcome }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="height: 500px">
      <!-- Document UI is defined over a document: gate it on having one. -->
      <epdf-stage *epdfDocumentGate="let document; fallback: loading" style="height: 100%">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p>Loading…</p></ng-template>
  `,
})
export class App {}
```

`localEngine()` costs nothing until it's used, so it's safe in your component, even with
server-side rendering. The viewer starts it in the browser: PDFium boots in a Web Worker in the
background, and the first page shows as soon as the document is open. The engine's WebAssembly is
part of your build and loads from your own site; see [Setup](https://www.embedpdf.com/docs/headless/angular/setup).

`*epdfDocumentGate` shows its `fallback` until the document is open, so the Stage never renders
without one.

## Every plugin

Each plugin is one import line. Registering a plugin and importing its components come from the
same place:

| Plugin                                                                                  | What it gives you                                                       | Import from                      |
| :-------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------- |
| [Stage](https://www.embedpdf.com/docs/headless/angular/viewing/stage)                   | Scrolling, zoom, layouts, page navigation                               | `@embedpdf/angular/stage`        |
| [Render](https://www.embedpdf.com/docs/headless/angular/viewing/render)                 | Sharp pages at every zoom, deep-zoom tiles                              | `@embedpdf/angular/render`       |
| [Links](https://www.embedpdf.com/docs/headless/angular/viewing/links)                   | Clickable links to pages and websites                                   | `@embedpdf/angular/link`         |
| [Selection](https://www.embedpdf.com/docs/headless/angular/text/selection)              | Selecting and copying text                                              | `@embedpdf/angular/selection`    |
| [Search](https://www.embedpdf.com/docs/headless/angular/text/search)                    | Finding text, and showing every match                                   | `@embedpdf/angular/search`       |
| [Annotations](https://www.embedpdf.com/docs/headless/angular/annotations)               | Highlights, notes, shapes, free text, and your own tools                | `@embedpdf/angular/annotation`   |
| [Stamps](https://www.embedpdf.com/docs/headless/angular/annotations/stamps)             | Libraries of stamps, placed by click or by code                         | `@embedpdf/angular/stamp`        |
| [Measurements](https://www.embedpdf.com/docs/headless/angular/annotations/measurements) | Distances, perimeters and areas at a real scale                         | `@embedpdf/angular/measurement`  |
| [Redaction](https://www.embedpdf.com/docs/headless/angular/annotations/redaction)       | Removing content for good                                               | `@embedpdf/angular/redaction`    |
| [Forms](https://www.embedpdf.com/docs/headless/angular/forms)                           | Filling and building PDF forms                                          | `@embedpdf/angular/form`         |
| [Signatures](https://www.embedpdf.com/docs/headless/angular/forms/signatures)           | Signing documents and checking signatures                               | `@embedpdf/angular/signature`    |
| [Page edit](https://www.embedpdf.com/docs/headless/angular/documents/pages)             | Rotating, reordering, inserting and deleting pages                      | `@embedpdf/angular/page-edit`    |
| [Metadata](https://www.embedpdf.com/docs/headless/angular/documents/metadata)           | A document's title, author and your own fields                          | `@embedpdf/angular/metadata`     |
| [Fonts](https://www.embedpdf.com/docs/headless/angular/documents/fonts)                 | The fonts a document can be written in, drawn as the engine writes them | `@embedpdf/angular/fonts`        |
| [Outline](https://www.embedpdf.com/docs/headless/angular/documents/outline)             | A document's outline (its bookmarks), to show, follow and edit          | `@embedpdf/angular/outline`      |
| [Attachments](https://www.embedpdf.com/docs/headless/angular/documents/attachments)     | The files a PDF carries: listing, saving, attaching and removing them   | `@embedpdf/angular/attachment`   |
| [Actions](https://www.embedpdf.com/docs/headless/angular/documents/actions)             | What a PDF does by itself: buttons, scripts, printing                   | `@embedpdf/angular/actions`      |
| [View manager](https://www.embedpdf.com/docs/headless/angular/documents/tabs)           | Several documents side by side                                          | `@embedpdf/angular/view-manager` |
| [Interaction](https://www.embedpdf.com/docs/headless/angular/ui/tools)                  | The active tool, cursors and touch                                      | `@embedpdf/angular/interaction`  |
| [Commands](https://www.embedpdf.com/docs/headless/angular/ui/commands)                  | Named actions with labels, icons and shortcuts                          | `@embedpdf/angular/commands`     |
| [Shell](https://www.embedpdf.com/docs/headless/angular/ui/panels)                       | Which panels, dialogs and menus are open                                | `@embedpdf/angular/shell`        |
| [Translations](https://www.embedpdf.com/docs/headless/angular/ui/translations)          | Your UI in the user's language                                          | `@embedpdf/angular/i18n`         |

## Documentation

- [Quick start](https://www.embedpdf.com/docs/headless/angular/quick-start): Build a PDF viewer step by step, with text selection, zoom buttons, a highlighter and a save button.
- [Setup](https://www.embedpdf.com/docs/headless/angular/setup): Server-side rendering, bundlers, fonts, and hosting the engine yourself.
- [How it works](https://www.embedpdf.com/docs/headless/angular/concepts/how-it-works): Plugins, how your UI talks to them, layers, and which document a component talks to.
- [Scroll, zoom & layout](https://www.embedpdf.com/docs/headless/angular/viewing/stage): Layouts, zoom modes, page navigation and touch.

## License

Apache-2.0
