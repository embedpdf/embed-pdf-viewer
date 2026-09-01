# @cloudpdf/sdk

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Action trees now use shared generated types for their payload-carrying union (destinations, URIs, named actions, Hide targets, ResetForm state, file specs) instead of repeating the same models for every annotation and form response path. Recursive `/Next` chain elements remain `unknown[]` — a Fern limitation of the emitted recursive schema, not missing data.

## 3.0.0-next.10

### Minor Changes

- [#791](https://github.com/embedpdf/embed-pdf-viewer/pull/791) by [@bobsingor](https://github.com/bobsingor) – Add `client.doc.annotations.listAll()` for retrieving every page's annotations
  as one coherent layer snapshot.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add generated SDK methods and request and response types for page insertion,
  blank-page creation, and page extraction.

## 3.0.0-next.8

## 3.0.0-next.7

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
