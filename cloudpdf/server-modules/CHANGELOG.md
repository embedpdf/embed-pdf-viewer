# @cloudpdf/server-modules

## 3.1.0

## 3.0.0

### Minor Changes

- [#967](https://github.com/embedpdf/embed-pdf-viewer/pull/967) by [@bobsingor](https://github.com/bobsingor) – `defineServerModule` takes a `name` (required), a `description` and `meters`; a request counts the module's meters with `req.meters.count(meter, { oncePerDay })`. Permissions take `replaces` and `bypassedBy`. `startTestServer`'s tenant has the given modules turned on, so their routes answer instead of `403 FeatureNotEnabled`.

- [#926](https://github.com/embedpdf/embed-pdf-viewer/pull/926) by [@bobsingor](https://github.com/bobsingor) – Add `@cloudpdf/server-modules`, for writing server modules: packages that run inside `@cloudpdf/server` with their own routes and permissions. `defineServerModule({ id, permissions, requires, config, setup })` defines one. In a route's handler, `req.document()` is the engine's document API as the caller, with exactly their permissions; `req.module.document()` is the same API as the module, with `doc.open` and what `requires.document` lists, and its pages also draw raw pixels: `page(ref).render.raw()`, as on the local engine. Both open on first use, as the server has the document then, read from the server itself even when it offers a CDN, and close when the handler returns. `decodePageKey` turns a route's page key (`obj:12`) into a `PageRef`. A handler refuses a request by throwing an `EngineError`, which the server answers in its own error body.

- [#955](https://github.com/embedpdf/embed-pdf-viewer/pull/955) by [@bobsingor](https://github.com/bobsingor) – Test a module in a real server from published packages: `startTestServer` from `@cloudpdf/server-modules/testing` starts `@cloudpdf/server` with your modules mounted, on `127.0.0.1` with its own in-memory database, files and credentials, licensed by a development key (`CLOUDPDF_LICENSE_KEY` or `licenseKey`). `addDocument(pdf)` uploads a PDF through the server's upload API and answers its id and page keys; `fetch(doc, path, { scope })` calls a route on the document's layer with a viewer token for exactly that scope; `token()` signs that token for a client of your own; `apiToken` calls as the deployment; `close()` removes everything. The kit also exports `HostedModule`, the type `defineServerModule` returns, so a module's declarations build with the kit as its only dependency.

### Patch Changes

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – The test server seeds its documents with the init request's `sizeBytes`.

- [#1002](https://github.com/embedpdf/embed-pdf-viewer/pull/1002) by [@bobsingor](https://github.com/bobsingor) – The test server reads the init answer's `status`.

## 3.0.0-next.23

### Patch Changes

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – The test server seeds its documents with the init request's `sizeBytes`.

- [#1002](https://github.com/embedpdf/embed-pdf-viewer/pull/1002) by [@bobsingor](https://github.com/bobsingor) – The test server reads the init answer's `status`.

## 3.0.0-next.22

### Minor Changes

- [#967](https://github.com/embedpdf/embed-pdf-viewer/pull/967) by [@bobsingor](https://github.com/bobsingor) – `defineServerModule` takes a `name` (required), a `description` and `meters`; a request counts the module's meters with `req.meters.count(meter, { oncePerDay })`. Permissions take `replaces` and `bypassedBy`. `startTestServer`'s tenant has the given modules turned on, so their routes answer instead of `403 FeatureNotEnabled`.

## 3.0.0-next.21

### Minor Changes

- [#955](https://github.com/embedpdf/embed-pdf-viewer/pull/955) by [@bobsingor](https://github.com/bobsingor) – Test a module in a real server from published packages: `startTestServer` from `@cloudpdf/server-modules/testing` starts `@cloudpdf/server` with your modules mounted, on `127.0.0.1` with its own in-memory database, files and credentials, licensed by a development key (`CLOUDPDF_LICENSE_KEY` or `licenseKey`). `addDocument(pdf)` uploads a PDF through the server's upload API and answers its id and page keys; `fetch(doc, path, { scope })` calls a route on the document's layer with a viewer token for exactly that scope; `token()` signs that token for a client of your own; `apiToken` calls as the deployment; `close()` removes everything. The kit also exports `HostedModule`, the type `defineServerModule` returns, so a module's declarations build with the kit as its only dependency.

## 3.0.0-next.20

### Minor Changes

- [#926](https://github.com/embedpdf/embed-pdf-viewer/pull/926) by [@bobsingor](https://github.com/bobsingor) – Add `@cloudpdf/server-modules`, for writing server modules: packages that run inside `@cloudpdf/server` with their own routes and permissions. `defineServerModule({ id, permissions, requires, config, setup })` defines one. In a route's handler, `req.document()` is the engine's document API as the caller, with exactly their permissions; `req.module.document()` is the same API as the module, with `doc.open` and what `requires.document` lists, and its pages also draw raw pixels: `page(ref).render.raw()`, as on the local engine. Both open on first use, as the server has the document then, read from the server itself even when it offers a CDN, and close when the handler returns. `decodePageKey` turns a route's page key (`obj:12`) into a `PageRef`. A handler refuses a request by throwing an `EngineError`, which the server answers in its own error body.
