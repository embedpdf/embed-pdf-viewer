# @embedpdf/viewer-react

The full EmbedPDF viewer as a React component: a thin wrapper around the
`<embedpdf-viewer>` custom element from [`@embedpdf/viewer`](https://www.npmjs.com/package/@embedpdf/viewer).

```bash
npm install @embedpdf/viewer-react
```

```tsx
import { PDFViewer } from '@embedpdf/viewer-react';

export function App() {
  return <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />;
}
```

No engine or wasm configuration is needed: the built-in local engine (PDFium
compiled to WebAssembly, running in a Web Worker) is the default, and your
bundler ships `embedpdf.wasm` inside your own build. Self-hosting, strict-CSP
worker delivery, and injecting a different engine implementation are all
available through the `engine` prop — see the docs.

## Children as slots

Children with a `slot` attribute project into the chrome's matching
`custom()` socket while staying in **your** React tree — your context, your
state, your CSS:

```tsx
<PDFViewer src="/report.pdf">
  <MyDocPicker slot="doc-picker" />
</PDFViewer>
```

## Driving the viewer

```tsx
<PDFViewer src="/report.pdf" onReady={(viewer) => viewer.execute('zoom:in')} />
```

`onReady` hands you the viewer handle: capability lenses via
`viewer.get(Token)`, the `watch` reactivity primitive, and the command trio.

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
