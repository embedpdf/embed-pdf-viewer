---
'@cloudpdf/engine': minor
---

The cloud engine has `doc.forms.copy(fields, { page?, offset?, values?, widgets?, objectNumbers? })`, and `doc.apply` takes the op `forms.copy`. The copies are made on the server in one request. Against a server older than 3.2 the change is refused with `NotImplemented` before anything is sent.
