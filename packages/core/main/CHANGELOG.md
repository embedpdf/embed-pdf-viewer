# @embedpdf/core

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Adds `createEventHook` (the one capability-event primitive: subscribe-only `EventHook<T>` face, snapshot fan-out, listener error isolation, inert after dispose) and `createSerialQueue` (promise-tail serialization) to the core toolkit.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Export `PermissionDenied` and add `DocumentsCapability.allows()` so hosts can
  gate document-level print and download controls using the active document's
  security policy.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Export `PageInsertResult`, `PageInsertBlankSpec`, and `PdfSize` from the main
  package so applications and plugins can type page-creation operations.

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add optional hints to capability tokens so missing-dependency errors can tell integrators which plugin to register.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt framework-independent EmbedPDF kernel. It owns serializable state, typed plugin capabilities, effects, scopes, and plugin lifecycle without depending on the DOM or a rendering engine.
