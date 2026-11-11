---
'@cloudpdf/engine': minor
---

The cloud engine has `doc.annotations.copy(refs, { page?, offset?, objectNumbers? })`, and `doc.apply` takes the op `annotations.copy`. The copies are made on the server in one request, so nothing is downloaded. Against a server older than 3.2 the change is refused with `NotImplemented` before anything is sent.
