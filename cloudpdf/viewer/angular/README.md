# @cloudpdf/viewer-angular

The full EmbedPDF viewer as a Angular component, wired to CloudPDF. There is no
WebAssembly and no Web Worker in your bundle — rendering happens on a CloudPDF
deployment (the SaaS at `api.cloudpdf.com`, or your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)), so the
only thing that crosses the network is HTTPS API traffic.

```bash
npm install @cloudpdf/viewer-angular
```

```ts
import { Component, input } from '@angular/core';
import { CloudPdfViewer } from '@cloudpdf/viewer-angular';

@Component({
  selector: 'app-report',
  imports: [CloudPdfViewer],
  template: `<cloudpdf-viewer baseUrl="https://api.cloudpdf.com" [docToken]="token()" style="height: 100vh" />`,
})
export class Report {
  readonly token = input.required<string>();
}
```

`docToken` is a doc-scoped JWT minted by your backend; `docId` opens a document
by id when the engine-level `token` already authorizes it. For several documents
at once, pass `documents` exactly as the open-source viewer takes it.

## It is the open viewer, with one thing swapped

This package is a thin **door** over
[`@embedpdf/viewer-angular`](https://www.npmjs.com/package/@embedpdf/viewer-angular):
it renders that project's `<epdf-pdf-viewer>` from its engine-agnostic entry and injects the
CloudPDF engine. Everything the open viewer accepts works here unchanged —
`layout`, `commands`, `icons`, `strings`, `theme`, your own components, the
ready event — and its documentation applies verbatim. To wire the engine
yourself, use `@embedpdf/viewer-angular/core` with `cloudEngine()` from
`@cloudpdf/engine`.

## Documentation

https://www.cloudpdf.com

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Everything CloudPDF ships to a browser is open source; everything that runs on a
server is commercial. This package is browser-side, so it is Apache-2.0 — as is
the viewer it wraps, from the [EmbedPDF](https://www.embedpdf.com) open-source
project. Rendering happens on a CloudPDF deployment (the SaaS, or a self-hosted
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) under a
separate written agreement), which is the commercial part.
