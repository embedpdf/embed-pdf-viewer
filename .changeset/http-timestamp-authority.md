---
'@embedpdf/core-signature': minor
---

`httpTimestampAuthority({ url })` is a timestamp authority reached over HTTP (RFC 3161): the `timestampAuthority` of a signature, and the `key` of a document timestamp. It asks for exactly the algorithm it is called with, with a nonce and the authority's certificate, and checks that the reply answers the request it sent: a granted status, a token, the nonce echoed, and the digest, algorithm and policy asked for.

It tries again only when no answer came, a network failure, a timeout or an HTTP 5xx or 429, so a signing key never signs twice for a hiccup. What the authority said fails at once. Every error it raises carries the authority's address in `details.authority`: `Network` when no answer came, `SignatureRefused` when the authority refused or answered something else, with the HTTP status or the failure it named.

Options: `hash`, `policy`, `headers`, `fetch`, `timeoutMs` and `retries`. In a browser, point `url` at a route of your own that passes the request on: most authorities send no CORS headers.
