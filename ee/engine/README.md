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

Commercial — see LICENSE.
