---
'@cloudpdf/engine': minor
---

A token function now runs once per token, not once per request. The engine keeps the token it gives, and calls the function again in the background a minute before that token expires, so no request waits for the renewal and a long session never runs out. Requests that arrive together share one call; a renewal that fails is tried again 5 seconds later while the kept token still works. When CloudPDF refuses a kept token, the engine asks the function once more and sends the request again. A literal token works as before.
