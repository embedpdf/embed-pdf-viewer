# @cloudpdf/viewer

The full EmbedPDF viewer with the CloudPDF engine as its default: the same
`<embedpdf-viewer>` element and `init()` as
[`@embedpdf/viewer`](https://www.npmjs.com/package/@embedpdf/viewer), whose
documents live on CloudPDF (the SaaS, or your own
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)). Opening
and reading a document is HTTPS API traffic only. The one exception is stamps:
a stamp library is a PDF cut into stamps in the browser, so the first time
someone opens Stamps or Signatures the viewer loads the local engine
(`embedpdf.wasm`, shipped in the same folder). Pass
`plugins: { stamp: { assetEngine } }` to supply your own.

## Usage

```html
<embedpdf-viewer id="viewer" style="height: 100vh"></embedpdf-viewer>

<script type="module">
  import 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';

  document.getElementById('viewer').src = { shareToken: 'shr_…' };
</script>
```

A cloud document isn't a URL, so it's given from script, not as an attribute.
Or create the viewer from script:

```js
import CloudPDF from 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';

CloudPDF.init({ target: '#viewer', src: { token: '<document token>' } });
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

Every customization option of the open-source viewer (the layout, commands,
icons, themes, languages) rides along verbatim; see the
[EmbedPDF docs](https://www.embedpdf.com/docs) for the vocabulary.

From npm instead of the CDN:

```bash
npm install @cloudpdf/viewer
```

```ts
import CloudPDF from '@cloudpdf/viewer';
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Everything CloudPDF ships to a browser is open source; everything that runs on a
server is commercial. This artifact is browser-side, so it is Apache-2.0 — as
are the viewer chrome and engine interfaces it is built on, from the
[EmbedPDF](https://www.embedpdf.com) open-source project. Rendering happens on a
CloudPDF deployment (the SaaS, or a self-hosted
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) under a
separate written agreement), which is the commercial part.
