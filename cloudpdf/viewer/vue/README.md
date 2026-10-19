# @cloudpdf/viewer-vue

The full EmbedPDF viewer as a Vue component, with the CloudPDF engine as its default. There
is no WebAssembly and no Web Worker in your bundle for reading: rendering
happens on CloudPDF (the SaaS, or your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)), so the
only thing that crosses the network is HTTPS API traffic.

```bash
npm install @cloudpdf/viewer-vue
```

```vue
<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';

defineProps<{ token: string }>();
</script>

<template>
  <PDFViewer :src="{ token }" style="height: 100vh" />
</template>
```

`src` is the document: `{ token }` with a document token your backend creates
for the user (a string, or a function that gives a fresh one), `{ id }` when the
engine's own `token` already allows it, or `{ shareToken }` with a share link
from the dashboard. Another `src` opens in its place. For several documents at
once, pass `documents`: entries of `{ src, name, password, active }`.

The viewer connects to CloudPDF SaaS (`https://engine.cloudpdf.com`). Your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) goes in the
engine's settings: `engine: { baseUrl: 'https://pdf.example.com' }`, with the
engine's own `token` and `fetch` beside it.

## It is the open viewer, with its engine swapped

This package is a **door** over [`@embedpdf/viewer-vue`](https://www.npmjs.com/package/@embedpdf/viewer-vue),
as that package is the same viewer with the built-in engine: the component is
the same `<PDFViewer>`, and so is every name around it. Everything the open viewer
accepts works here unchanged (`layout`, `commands`, `icons`, `strings`,
`theme`, `plugins`, your components inside it, the ready callback) and its
documentation applies verbatim. Only the documents are in the cloud's words.

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
