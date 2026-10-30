# @embedpdf/viewer-angular

The full EmbedPDF viewer as an Angular component: a thin wrapper around the
`<embedpdf-viewer>` custom element from [`@embedpdf/viewer`](https://www.npmjs.com/package/@embedpdf/viewer).

```bash
npm install @embedpdf/viewer-angular
```

```ts
import { Component } from '@angular/core';
import { EpdfPdfViewer } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-root',
  imports: [EpdfPdfViewer],
  template: `<epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />`,
})
export class App {}
```

No engine or wasm configuration is needed: the built-in local engine (PDFium
compiled to WebAssembly, running in a Web Worker) is the default, and your
bundler ships `embedpdf.wasm` inside your own build. Self-hosting, strict-CSP
worker delivery, and injecting a different engine implementation are all
available through the `engine` input — see the docs.

## Your own components

`epdfToolbarItem`, `epdfPanel` and `epdfRegion` put a template of yours in the
place the layout makes for it. It's instantiated in your component's view, so
your injector, your state and your CSS apply:

```ts
@Component({
  selector: 'app-review',
  imports: [EpdfPdfViewer, EpdfToolbarItem, DocPicker],
  template: `
    <epdf-pdf-viewer src="/report.pdf" [layout]="layout">
      <ng-template epdfToolbarItem="doc-picker"><app-doc-picker /></ng-template>
    </epdf-pdf-viewer>
  `,
})
export class Review {
  readonly layout = (layout: Layout) =>
    layout.add({ custom: 'doc-picker' }, { to: 'main', section: 'start' });
}
```

`EpdfToolbarItemContext` tells it where it sits, and `<epdf-button>`,
`<epdf-menu>` and `<epdf-menu-item>` (`EpdfButton`, `EpdfMenu`, `EpdfMenuItem`)
are the viewer's own, for yours.

## Driving the viewer

```html
<epdf-pdf-viewer src="/report.pdf" (ready)="$event.commands.execute('zoom:in')" />
```

`(ready)` hands you the `viewer`: each plugin's API by its name
(`viewer.get('search')`, or its token), `viewer.documents`, `viewer.commands`
and the `watch` reactivity primitive. Inside the viewer's templates, inject
`EpdfPdfViewerRef` for its `viewer` signal; the headless services and the
`epdfCommand` directive of `@embedpdf/angular` work there too.
`(documentChange)` and `(panelResize)` say when the active document changes and
when someone resizes a panel. When the viewer goes, its `viewer` is done: its
listeners stop and its calls refuse.

`src`, `theme`, `locale`, `disable`, `readOnly` and `fetch` follow their inputs
while the viewer runs; every other input is read once, so render a new
`<epdf-pdf-viewer>` (another `@if` branch) to start over with a changed one.

## Server-side rendering

Safe to render on the server with Angular SSR: `<epdf-pdf-viewer>` renders the
empty `<embedpdf-viewer>` element, and the viewer starts in the browser.
`@defer (on viewport)` also keeps its code out of the first download.

## Documentation

Full guides and API reference: https://www.embedpdf.com/docs

## License

Apache-2.0
