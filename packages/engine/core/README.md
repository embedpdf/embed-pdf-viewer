# @embedpdf/engine-core

Engine v3 core: the transport-agnostic contract every EmbedPDF engine
implementation speaks.

- `Engine` / `DocumentHandle` interfaces and `AbortablePromise`
- DTOs, wire schemas, and `EngineError` codes
- a conformance harness shared by every implementation — the local WASM
  engine ([`@embedpdf/engine`](https://www.npmjs.com/package/@embedpdf/engine))
  and the cloud client ([`@cloudpdf/engine`](https://www.npmjs.com/package/@cloudpdf/engine))
  are parity-tested against it

You normally don't install this directly — it arrives as a dependency of an
engine implementation. Depend on it directly when writing your own `Engine`
implementation or typing code against the contract without choosing an
implementation.

## Documentation

https://www.embedpdf.com/docs

## License

Apache-2.0
