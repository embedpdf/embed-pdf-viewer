# @cloudpdf/viewer-react

The full EmbedPDF viewer as a React component, wired to CloudPDF. There is no
WebAssembly and no Web Worker in your bundle — rendering happens on a CloudPDF
deployment (the SaaS at `api.cloudpdf.com`, or your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)), so the
only thing that crosses the network is HTTPS API traffic.

```bash
npm install @cloudpdf/viewer-react
```

```tsx
import { CloudPDFViewer } from '@cloudpdf/viewer-react';

export function Report({ token }: { token: string }) {
  return (
    <CloudPDFViewer
      baseUrl="https://api.cloudpdf.com"
      docToken={token}
      style={{ height: '100vh' }}
    />
  );
}
```

`docToken` is a doc-scoped JWT minted by your backend; `docId` opens a document
by id when the engine-level `token` already authorizes it. For several documents
at once, pass `documents` exactly as the open-source viewer takes it.

## It is the open viewer, with one thing swapped

This package is a thin **door** over
[`@embedpdf/viewer-react`](https://www.npmjs.com/package/@embedpdf/viewer-react):
it renders that project's `<PDFViewer>` from its engine-agnostic entry and
injects the CloudPDF engine. Everything the open viewer accepts works here
unchanged — `chrome`, `commands`, `icons`, `strings`, `theme`,
children-as-slots, `onReady` — and its documentation applies verbatim.

```tsx
<CloudPDFViewer baseUrl={baseUrl} docToken={token} onReady={(viewer) => …}>
  <MyStatusChip slot="doc-status" />
</CloudPDFViewer>
```

If you would rather wire the engine yourself — for a self-hosted server, or
alongside other engines — skip this package and use the open door directly:

```tsx
import { PDFViewer } from '@embedpdf/viewer-react/core';
import { cloudEngine } from '@cloudpdf/engine';

<PDFViewer engine={() => cloudEngine({ baseUrl })} documents={docs} />;
```

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
