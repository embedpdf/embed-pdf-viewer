---
'@cloudpdf/server-modules': minor
---

Test a module in a real server from published packages: `startTestServer` from `@cloudpdf/server-modules/testing` starts `@cloudpdf/server` with your modules mounted, on `127.0.0.1` with its own in-memory database, files and credentials, licensed by a development key (`CLOUDPDF_LICENSE_KEY` or `licenseKey`). `addDocument(pdf)` uploads a PDF through the server's upload API and answers its id and page keys; `fetch(doc, path, { scope })` calls a route on the document's layer with a viewer token for exactly that scope; `token()` signs that token for a client of your own; `apiToken` calls as the deployment; `close()` removes everything. The kit also exports `HostedModule`, the type `defineServerModule` returns, so a module's declarations build with the kit as its only dependency.
