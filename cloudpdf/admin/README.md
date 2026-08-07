# @cloudpdf/admin

The CloudPDF admin SDK — Node-only, for a customer's **backend**. It holds
your deployment's API token (or a delegated tenant JWT) to upload PDFs and
manage the document lifecycle against a
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)
deployment.

> Never ship this SDK or its credentials to the browser. End users receive
> doc-scoped tokens and talk to the engine via
> [`@cloudpdf/engine`](https://www.npmjs.com/package/@cloudpdf/engine).

```bash
npm install @cloudpdf/admin
```

```ts
import { createCloudAdmin } from '@cloudpdf/admin';

const cloud = createCloudAdmin({
  baseUrl: 'https://engine.example.com',
  apiToken: process.env.CLOUDPDF_API_AUTH_TOKEN!,
});

const doc = await cloud.tenant('default').documents.create({
  bytes,
  metadata: { name: 'report.pdf' },
});
```

## Documentation

https://www.cloudpdf.com

## License

Commercial — see LICENSE.
