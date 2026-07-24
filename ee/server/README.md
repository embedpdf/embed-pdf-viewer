# @cloudpdf/server

The self-hostable CloudPDF document engine server: a Fastify-based HTTP/REST
API in front of a Node `worker_thread` pool running **native** PDFium via
`@embedpdf/engine-runtime`. It executes the same `@embedpdf/engine-services`
code as the local browser engine, so results are identical wherever a
document is processed.

Clients speak to it through:

- [`@cloudpdf/engine`](https://www.npmjs.com/package/@cloudpdf/engine) — the
  browser engine client (Engine v3 over HTTPS), used standalone or injected
  into the EmbedPDF viewer / [`@cloudpdf/viewer`](https://www.npmjs.com/package/@cloudpdf/viewer).
- [`@cloudpdf/admin`](https://www.npmjs.com/package/@cloudpdf/admin) — the
  Node-only backend SDK for uploading documents and minting user tokens.

## Documentation

Deployment and configuration guides: https://www.cloudpdf.com

## License

Commercial — see LICENSE.
