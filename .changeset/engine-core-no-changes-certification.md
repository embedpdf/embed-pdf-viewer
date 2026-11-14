---
'@embedpdf/engine-core': patch
---

Judge two cases the way Acrobat does, from new Acrobat observations.

**A certification that allows no changes (`permission: 1`) allows no later revision.** The PDF standard lets validation data and a document timestamp follow one, and the engine did too. Acrobat reports such a certification as invalid once anything is added, so:

- `analyze()` and `validateSignatures()` read every object written after it as `forbidden`, with the rule `no-changes-certification`. Validation data and a document information dictionary read `permitted` before.
- The engine refuses signing, a document timestamp included, and metadata changes on such a document, with `ProtectedDocument`. `doc.security.allows('doc.sign')` is `false` there. `signedDocumentPolicy: 'permit'` still turns the refusals off.
- A document timestamp that was added after such a certification is judged on its own, as Acrobat judges it: the certification reads changed, the timestamp does not inherit its limit.

**A signature field added by Acrobat no longer reads as a forbidden change.** When Acrobat adds a document timestamp to a page whose `/Annots` is an array inside the page, it moves the array into an object of its own. The earlier signature read `forbidden` (`page /Annots added or removed a form widget`) and now reads `permitted`.

`SIGNATURE_POLICY_VERSION` is 5. For a certification at level 2 or 3 and for approval signatures nothing changes.
