# CloudPDF Dashboard

The CloudPDF product demo: upload PDFs, share them with different people under
different permissions, and open them in the cloud viewer — with every wire call
inspectable.

Its job is to make three things visible that no local-engine demo can show:

1. **Nothing renders in the browser.** There is no PDF engine in this bundle.
   Page images, text, geometry and annotation appearances all arrive over HTTPS
   from a `@cloudpdf/server` origin. The document tiles in the library are
   server-rendered at ingest.
2. **Scopes are real.** A share's token decides what the viewer can do; the
   plugins mirror the same capability checks the engine enforces, so a
   read-only share simply has no annotation tools.
3. **Layers are real.** Two people annotating the same document write into
   separate layers over one immutable base — the original bytes never change.

## Run

```bash
pnpm --filter @embedpdf/example-cloud-dashboard build:deps
pnpm --filter @embedpdf/example-cloud-dashboard dev
```

Then open http://127.0.0.1:5178.

> `build:deps` matters: the viewer packages ship **bundled** dists that inline
> the engine and wire code, so a stale build there shows up as failed renders in
> the browser, not as a type error.

Local data (SQLite, object storage, the shares sidecar) lives under
`examples/cloud-dashboard/.data`.

## What's where

| Path                     | What it is                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `server/dev-server.ts`   | Embedded `@cloudpdf/server` origin + the demo's own admin helper (`/api/*`): uploads, token minting, audit export |
| `server/shares-store.ts` | The demo's stand-in for the sharing table an integrator keeps in _their_ database                                 |
| `src/screens/`           | Library (upload + document grid) and Document (the viewer)                                                        |
| `src/share/roles.ts`     | Role presets — the product-facing name for a set of engine scopes                                                 |

The browser reaches the engine same-origin through the Vite proxy, so the SDK
runs with `baseUrl: ''` — the shape a production app behind a reverse proxy
uses. `/api` is this demo's console standing in for a customer backend; only
`/v1` is the actual product.

## Useful env

```bash
CLOUDPDF_SMOKE_JWT_SECRET=cloudpdf-dev-secret-change-me
CLOUDPDF_SMOKE_STATIC_KMS_KEK=<base64-encoded-32-byte-key>
CLOUDPDF_SMOKE_TENANT=tenant-demo
CLOUDPDF_SMOKE_ENGINE_PORT=3210
CLOUDPDF_SMOKE_API_PORT=3211
CLOUDPDF_SMOKE_CDN=bunny   # none | bunny | cloud-cdn | cloudfront-* | azure-fd | custom-hmac-*
```

`CLOUDPDF_SMOKE_STATIC_KMS_KEK` is optional locally; the dev server supplies an
in-memory-only development key when it is omitted. Every CDN adapter is
configured with fake hostnames and secrets — the point is to see the URL and
token _shapes_ the server emits, not to reach a real edge.
