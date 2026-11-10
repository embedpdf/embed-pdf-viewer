<!-- Generated from docs/content/headless/quick-start.mdx by docs/content/scripts/readmes.mjs. Edit the page, then run `pnpm readme:sync`. -->

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

## Documentation

- [Quick start](https://www.embedpdf.com/docs/headless/react/quick-start): Build a PDF viewer step by step, with text selection, zoom buttons, a highlighter and a save button.
- [Setup](https://www.embedpdf.com/docs/headless/react/setup): Server-side rendering, bundlers, fonts, and hosting the engine yourself.
- [How it works](https://www.embedpdf.com/docs/headless/react/concepts/how-it-works): Plugins, how your UI talks to them, layers, and which document a component talks to.
- [Scroll, zoom & layout](https://www.embedpdf.com/docs/headless/react/viewing/stage): Layouts, zoom modes, page navigation and touch.

## License

Apache-2.0
