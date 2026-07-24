# @cloudpdf/admin

The CloudPDF admin SDK — Node-only, for a customer's **backend**. It carries
a tenant-scoped admin credential to upload PDFs, manage the document
lifecycle, and mint user-scoped document JWTs against a
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

const admin = createCloudAdmin({
  baseUrl: 'https://api.cloudpdf.com',
  token: process.env.CLOUDPDF_ADMIN_TOKEN!,
});

const doc = await admin.documents.create({
  bytes,
  metadata: { name: 'report.pdf' },
});
```

## Documentation

https://www.cloudpdf.com

## License

Commercial — see LICENSE.
