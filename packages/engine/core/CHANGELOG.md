# @embedpdf/engine-core

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Exports `wireTemplates`, the canonical Fastify-style path templates for backend-callable, unversioned document-plane routes. The templates let `@cloudpdf/contract` and server route-conformance checks share one source of truth without exposing the viewer-only immutable URL variants.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the transport-independent Engine v3 contract. It includes engine and document interfaces, DTOs, wire schemas, error handling, abortable operations, and a conformance harness shared by local and cloud implementations.
