---
'@cloudpdf/engine': minor
---

Add the `renderRaw` option: where raw page pixels come from when the engine runs inside the server it talks to, as a server module's own document does. With it, `page(ref).render.raw()` gives the pixels and their transform, as on the local engine. Without it, which is everywhere else, `raw()` is refused with `NotImplemented`: over the network the cloud API serves images, through `image()`.

Add the `cdn` option: `cdn: false` reads everything from the server itself, even when the server offers a CDN, and skips the `/access` call that only fetched CDN credentials. For code running next to the server (a server module, a backend in the same network), where the CDN only adds a hop.
