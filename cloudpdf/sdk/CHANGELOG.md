# @cloudpdf/sdk

## 3.0.0-next.6

### Minor Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add the generated `documents.importFrom` client method and request and response types. The SDK accepts URL or operator-registered connection sources, supports synchronous and asynchronous import modes, exposes integrity, deduplication, metadata, and idempotency options, and maps upstream transport failures to `BadGatewayError`.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds the generated TypeScript SDK and its high-level `uploads.create` workflow.
  It hashes browser and Node.js upload sources, negotiates presigned or proxy
  transfer, uploads the bytes, and commits only after integrity verification.
