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

## License configuration

The server fails closed when no valid CloudPDF license is available. For a
connected development or production license, configure:

```sh
export CLOUDPDF_LICENSE_MODE=connected
export CLOUDPDF_LICENSE_KEY='your-key-or-secret://-reference'
cloudpdf-server license status
```

Do not commit a license key or paste it into CI logs. `secret://` references
can be resolved through the server's configured secrets provider.

The production licensing identity is compiled into the package. Connected
validation goes to `https://api.keygen.sh`, and aggregated usage reporting,
when required by the signed license metadata, goes to
`https://api.cloudpdf.com`. These hosts, the CloudPDF product ID, and the
Ed25519 verification key cannot be replaced with environment variables.

Every successful connected decision must have a fresh Keygen response
signature bound to the request nonce, deployment fingerprint, CloudPDF
product, account, and license key. The exact signed proof is encrypted in the
license-state database and its signature is verified again before cache or
offline-grace access is granted. Unsigned, stale, replayed, modified, or
operator-authored database values never grant full access.

Air-gapped deployments use `cloudpdf-server license request` and
`cloudpdf-server license install`; the installed machine certificate is
verified against the same compiled CloudPDF identity on every refresh.

## License

Commercial — see LICENSE.
