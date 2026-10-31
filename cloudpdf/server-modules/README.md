# @cloudpdf/server-modules

Write a server module: a package that runs inside
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) with its own routes and
permissions. Each request reaches the document through the engine's own document API, the one
[`@cloudpdf/engine`](https://www.npmjs.com/package/@cloudpdf/engine) and the viewer use: as the
person calling, with exactly their permissions, and as the module itself, with what it lists in
`requires`.

```bash
npm install @cloudpdf/server-modules
```

```ts
import { defineServerModule } from '@cloudpdf/server-modules';

export default defineServerModule({
  id: 'review',
  permissions: {
    approve: { level: 'document', label: 'Approve documents' },
  },

  setup(host) {
    host.docRoute({
      method: 'POST',
      path: 'approve',
      permission: 'approve',
      async handler(req) {
        // As the reviewer: refused if they may not add annotations.
        const doc = await req.document();
        const { pages } = await doc.pages.list();
        await doc.page(pages[0]!.ref).annotations.create({
          subtype: 'square',
          box: { x: 20, y: 20, width: 120, height: 40 },
        });
        return { status: 204 };
      },
    });
  },
});
```

The server loads it from `CLOUDPDF_MODULES=@acme/review-module`. See
[Modules](https://www.cloudpdf.com/docs/server/configuration/modules) in the server docs.

## License

Apache-2.0
