---
'@cloudpdf/server': minor
---

Every response says which version the server is, in `EmbedPDF-Server-Version`. A request's `EmbedPDF-Version` is answered within the server's major; another major, or a value that isn't `<major>.<minor>`, gets a 400 naming both versions. CORS allows `EmbedPDF-Version` and exposes `EmbedPDF-Server-Version`.
