# @cloudpdf/contract

The CloudPDF engine's contract: the operation registry, zod schemas, and
OpenAPI emitter for every backend-callable surface — deployment and tenant
administration plus the document operations (reads, annotations, forms,
page operations, redaction, download).

The registry is executed, not merely described:
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) mounts
its admin routes from these entries and validates with these schemas, the
[`@cloudpdf/admin`](https://www.npmjs.com/package/@cloudpdf/admin) SDK types
its requests with them, and the committed `openapi.json` is generated from
them (`pnpm emit:openapi`) — a freshness test fails CI whenever the two
diverge.

Wire vocabulary (document shapes, capability scopes, doc-plane path
templates, the engine error envelope) is imported from
`@embedpdf/engine-core`, never restated: this package curates and annotates
the protocol with credentials, scopes, and documentation metadata. The
interactive viewer-session protocol (`/v1/access`, immutable `@{version}`
reads, SSE) deliberately stays out — that transport belongs to the CloudPDF
viewer SDKs and is free to evolve behind them.

## License

Apache-2.0
