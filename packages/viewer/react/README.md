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

## Your own components

`ToolbarItem`, `Panel` and `Region` put your component in the place the layout
makes for it, while it stays in **your** React tree — your context, your
state, your CSS:

```tsx
<PDFViewer
  src="/report.pdf"
  layout={(layout) => layout.add({ custom: 'doc-picker' }, { to: 'main', section: 'start' })}
>
  <ToolbarItem id="doc-picker">
    <MyDocPicker />
  </ToolbarItem>
</PDFViewer>
```

`useToolbarItem()` tells it where it sits, and `Button`, `Menu` and `MenuItem`
are the viewer's own, for yours.

## Driving the viewer

```tsx
<PDFViewer
  src="/report.pdf"
  onReady={(viewer) => viewer.commands.execute('zoom:in')}
/>
```

`onReady` hands you the `viewer`: each plugin's API by its name
(`viewer.get('search')`, or its token), `viewer.documents`, `viewer.commands`
and the `watch` reactivity primitive. Inside the viewer, a component of yours
gets it with `usePDFViewer()`, and `useCommand(id)` gives it a command as a
button needs it (label, icon, shortcut, state and `run()`). The headless hooks
of `@embedpdf/react` work there too. When the viewer unmounts, its `viewer` is
done: its listeners stop and its calls refuse.

`plugins` takes each plugin's settings by its name
(`plugins={{ stage: { spread: 'odd' } }}`), and a plugin of your own by a name
`viewer.get()` then finds it under.

`src`, `theme`, `locale`, `disable`, `readOnly` and `fetch` follow their props
while the viewer runs; every other prop is read once, so give the viewer a new `key` to
start over with a changed one.

## Server-side rendering

The package is a client component (`'use client'`) and safe to import on the
server, where `<PDFViewer>` renders the empty `<embedpdf-viewer>` element; the
viewer starts in the browser.

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
