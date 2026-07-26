# @cloudpdf/engine

The CloudPDF engine: a browser client that speaks the Engine v3 interface
over HTTPS to a [`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server)
deployment (or the CloudPDF SaaS). Same `AbortablePromise`-based,
`EngineError`-coded contract as the local WASM engine
([`@embedpdf/engine`](https://www.npmjs.com/package/@embedpdf/engine)) — the
two are parity-tested against the shared conformance harness, so viewers and
application code work with either.

No WebAssembly, no Web Workers: rendering happens server-side.

```bash
npm install @cloudpdf/engine
```

```ts
import { cloudEngine } from '@cloudpdf/engine';

const engine = cloudEngine({
  baseUrl: 'https://api.cloudpdf.com',
});

const document = await engine.open({ kind: 'token', token: docScopedJwt });
```

Inject it into the EmbedPDF viewer exactly like any other engine:

```ts
EmbedPDF.init({
  target: '#viewer',
  engine: () => cloudEngine({ baseUrl }),
});
```

## Documentation

https://www.cloudpdf.com

## License

Apache-2.0 — see [LICENSE](./LICENSE).

Everything CloudPDF ships to a browser is open source; everything that runs on a
server is commercial. This package is the browser client, so it is Apache-2.0 —
free to read, vendor, and fork. It talks to a
[`@cloudpdf/server`](https://www.npmjs.com/package/@cloudpdf/server) deployment,
which is the commercial part: the CloudPDF SaaS, or a server you self-host under
a separate written agreement.

(Contributors: this package's integration tests boot a real server, so `pnpm
test` here needs `@cloudpdf/server` — a dev dependency that is not Apache-2.0.
The client source and its published `dist` are.)
