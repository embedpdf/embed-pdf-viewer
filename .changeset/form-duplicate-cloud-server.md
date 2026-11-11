---
'@cloudpdf/server': minor
---

`POST …/changes` takes the new op `forms.copy`: a new field from each field named, with its widgets, made on the server. It needs `doc.forms.modify`, and `doc.forms.script` to keep scripts, submits and links. A field the form doesn't have refuses the change with `NotFound`. On the event stream, a client that says a version before 3.2 gets `full-refresh` in place of a change with this op. A copy stays within the server's `bundleLimits`: more fields than `items` refuses its change with `PayloadTooLarge`.
