# @cloudpdf/viewer

The full EmbedPDF viewer wired to the CloudPDF engine, delivered as one CDN
artifact: `cloudpdf.js`. Rendering happens on a CloudPDF deployment (the SaaS
at `api.cloudpdf.com`, or your own [`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)),
so opening and reading a document is HTTPS API traffic only. The one exception
is stamps: a stamp library is a PDF that is cut into stamps in the browser, so
the first time someone opens Stamps or Signatures the viewer loads the local
engine (`embedpdf.wasm`, shipped in the same folder). Pass
`stamps: { assetEngine }` to supply your own.

## Usage

```html
<div id="viewer" style="height: 100vh"></div>
<script type="module">
  import CloudPDF from 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@VERSION/dist/cloudpdf.js';

  CloudPDF.init({
    target: '#viewer',
    baseUrl: 'https://api.cloudpdf.com',
    docToken: '<doc-scoped JWT>',
  });
</script>
```

- `docToken` opens one document by its doc-scoped JWT.
- `docId` opens by cloud document id (the engine-level `token` must authorize it).
- Every customization option of the open-source viewer — chrome schema,
  commands, icons, themes, locales — rides along verbatim; see the
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
