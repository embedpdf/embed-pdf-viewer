# @cloudpdf/viewer-svelte

The full EmbedPDF viewer as a Svelte component, wired to CloudPDF. There is no
WebAssembly and no Web Worker in your bundle — rendering happens on a CloudPDF
deployment (the SaaS at `api.cloudpdf.com`, or your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)), so the
only thing that crosses the network is HTTPS API traffic.

```bash
npm install @cloudpdf/viewer-svelte
```

```svelte
<script lang="ts">
  import { CloudPDFViewer } from '@cloudpdf/viewer-svelte';

  let { token }: { token: string } = $props();
</script>

<CloudPDFViewer baseUrl="https://api.cloudpdf.com" src={{ token }} style="height: 100vh" />
```

`src` is the document: `{ token }` with a document token your backend creates
for the user (a string, or a function that gives a fresh one), `{ id }` when the
engine-level `token` already allows it, or `{ shareToken }` with a share link
from the dashboard. Another `src` opens in its place. For several documents at
once, pass `documents`: entries of `{ src, name, password, active }`.

## It is the open viewer, with one thing swapped

This package is a thin **door** over
[`@embedpdf/viewer-svelte`](https://www.npmjs.com/package/@embedpdf/viewer-svelte):
it renders that project's `<PDFViewer>` from its engine-agnostic entry and injects the
CloudPDF engine. Everything the open viewer accepts works here unchanged —
`layout`, `commands`, `icons`, `strings`, `theme`, your own components, the
ready event — and its documentation applies verbatim. To wire the engine
yourself, use `@embedpdf/viewer-svelte/core` with `cloudEngine()` from
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
