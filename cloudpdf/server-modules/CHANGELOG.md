# @cloudpdf/server-modules

## 3.0.0-next.20

### Minor Changes

- [#926](https://github.com/embedpdf/embed-pdf-viewer/pull/926) by [@bobsingor](https://github.com/bobsingor) – Add `@cloudpdf/server-modules`, for writing server modules: packages that run inside `@cloudpdf/server` with their own routes and permissions. `defineServerModule({ id, permissions, requires, config, setup })` defines one. In a route's handler, `req.document()` is the engine's document API as the caller, with exactly their permissions; `req.module.document()` is the same API as the module, with `doc.open` and what `requires.document` lists, and its pages also draw raw pixels: `page(ref).render.raw()`, as on the local engine. Both open on first use, as the server has the document then, read from the server itself even when it offers a CDN, and close when the handler returns. `decodePageKey` turns a route's page key (`obj:12`) into a `PageRef`. A handler refuses a request by throwing an `EngineError`, which the server answers in its own error body.
