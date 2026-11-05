---
'@cloudpdf/server': minor
---

Every point in time the server sends is an ISO 8601 string in UTC, and a grant's and a token revoke's `expiresAt` are taken as one, with its offset. Rows keep their milliseconds. The admin routes' records are typed by the contract's, so a field the contract doesn't say no longer compiles.
