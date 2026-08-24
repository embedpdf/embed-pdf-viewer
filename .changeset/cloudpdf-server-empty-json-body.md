---
'@cloudpdf/server': patch
---

Accepts bodyless requests that carry `Content-Type: application/json` instead of failing them with an unhandled 500.

- An empty JSON body now parses as no body rather than `FST_ERR_CTP_EMPTY_JSON_BODY` — the shape the generated PHP, Go, and Ruby SDKs (and clients with default JSON headers) send for bodyless calls such as document delete. Non-empty bodies still go through Fastify's default parser, keeping its prototype-poisoning protection, and routes that require a body still reject its absence with a 400.
- The error handler now honors Fastify's `statusCode` on framework errors, so parser and payload rejections (empty or malformed JSON, body limits) surface as the 4xx client errors they are instead of being logged and returned as "unhandled error" 500s.
