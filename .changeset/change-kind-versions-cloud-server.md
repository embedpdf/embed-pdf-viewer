---
'@cloudpdf/server': minor
---

The event stream answers each client as its version reads. A change with a kind that arrived after the client's `EmbedPDF-Version` goes out as `full-refresh` in the row's place, and the stream carries on with the rows after it; a `full-refresh` now says why in its data (`reason`). An op of `POST …/changes` with a field the server doesn't know refuses the request with `InvalidArg`, naming the field, where the field used to be dropped and the op applied without it. An item of a kind the server doesn't know is withheld from a connection that may not read everything.
