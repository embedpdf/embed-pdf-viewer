---
'@cloudpdf/server': minor
---

A change analysis is never refused for the rules it was asked under. The rules that judge what a signature allows after it are now a part of the `analysis` engine value in `/head`, as the API evolution convention has every rule the server computes with.

Before, a client put the number of those rules in the analysis URL (`policy`), and the server answered `InvalidArg` for any number but its own. A server on new rules refused every older viewer, which then showed "what changed since the signature" as indeterminate.

- `GET …/signatures/analysis@<token>`: a token that carries `policy`, as a client of 3.0 to 3.2 writes it, is answered like any other. The token's engine value decides whether the answer is cached.
- `GET …/versions/analysis/:sha256` takes `engine`, the `analysis` value from `/head`. With this server's value a settled answer is `immutable`. With another value, or with none, the answer is this server's own, with `no-store` and the current value in `EmbedPDF-Engine`. A `policy` parameter is ignored.
- An analysis that a worker judged under other rules, in the middle of a deploy, is answered uncached. It was an error.
- The `analysis` engine value changes once with this release, so cached analyses are computed again.
