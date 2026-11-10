<!-- Generated from docs/content/engine/quick-start.mdx and docs/content/engine/index.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/engine

The EmbedPDF engine: opens, renders, searches, edits and saves PDF files in the browser and in Node, with one typed API.

## Quick start

This guide opens a PDF, shows its first page, searches it, highlights a match and saves the
result.

### 1. Install

```sh
npm install @embedpdf/engine
```

### 2. Create the engine

Create one engine for your whole app and reuse it.

```ts
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
```

Creating it is instant. The engine starts PDFium in a Web Worker the first time you use it, so
you don't have to wait for anything here.

### 3. Open a PDF

Give the engine the file's bytes. Here we fetch them from a URL; a file the user picked works
the same way (`await file.arrayBuffer()`).

```ts
const response = await fetch('https://www.embedpdf.com/pdfs/invoice.pdf');
const doc = await engine.open({ kind: 'bytes', bytes: await response.arrayBuffer() });
```

`doc` is your handle to the open document. Everything else starts from it.

### 4. Show the first page

List the pages, then render the first one as an image:

```ts
const { pages } = await doc.pages.list();
const firstPage = doc.page(pages[0].ref);

const image = await firstPage.render.image({ viewport: { kind: 'width', width: 800 } });
const { url } = await image.objectUrl();

document.querySelector('img')!.src = url;
```

Each page has a `ref`: its address in the document. `doc.page(ref)` gives you a handle for that
page, and you pass the same `ref` to anything that works on pages.

## What you can do

- **[Render pages](https://www.embedpdf.com/docs/engine/documents/rendering)** as images, at any size.
- **[Read](https://www.embedpdf.com/docs/engine/text/extraction), [search](https://www.embedpdf.com/docs/engine/text/search) and
  [select](https://www.embedpdf.com/docs/engine/text/selection-and-geometry)** the text on a page, and find out where
  each character is.
- **[Add and edit annotations](https://www.embedpdf.com/docs/engine/annotations)**: highlights, notes, shapes, stamps,
  measurements. Copy them to another document with
  [import & export](https://www.embedpdf.com/docs/engine/annotations/import-export).
- **[Fill forms](https://www.embedpdf.com/docs/engine/forms)**, create form fields and
  [sign](https://www.embedpdf.com/docs/engine/forms/signatures) documents.
- **[Change pages](https://www.embedpdf.com/docs/engine/documents/pages)**: rotate, reorder, delete, insert, merge and
  split.
- **[Redact](https://www.embedpdf.com/docs/engine/documents/redaction)** content for good, and
  **[save](https://www.embedpdf.com/docs/engine/documents/saving)** the result.
- **[Group edits into changes](https://www.embedpdf.com/docs/engine/documents/changes)** that apply all or none, and undo
  or redo any of them.

Every call is async, can be cancelled, and fails with a typed error you can branch on. The same
code runs on the local engine and on the CloudPDF engine: only how you create the engine and
open a file differs.

## Documentation

- [Quick start](https://www.embedpdf.com/docs/engine/quick-start): Open a PDF, render its first page, read and search its text, highlight a match and save the result.
- [Setup](https://www.embedpdf.com/docs/engine/setup): Bundlers, workers, server-side rendering and fonts.
- [Annotations](https://www.embedpdf.com/docs/engine/annotations): Every kind of annotation, and how to change them.
- [Selection & geometry](https://www.embedpdf.com/docs/engine/text/selection-and-geometry): Find the text under the pointer and draw your own selection.

## License

Apache-2.0
