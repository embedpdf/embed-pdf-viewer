---
'@embedpdf/engine-core': patch
---

Judge two cases the way Acrobat does, from new Acrobat observations.

**A certification that allows no changes (`permission: 1`) allows no later revision.** The PDF standard lets validation data and a document timestamp follow one, and the engine did too. Acrobat reports such a certification as invalid once anything is added, so:

- `analyze()` and `validateSignatures()` read every object written after it as `forbidden`, with the rule `no-changes-certification`. Validation data and a document information dictionary read `permitted` before.
- The engine refuses signing, a document timestamp included, and metadata changes on such a document, with `ProtectedDocument`. `doc.security.allows('doc.sign')` is `false` there. `signedDocumentPolicy: 'permit'` still turns the refusals off.
- A document timestamp that was added after such a certification is judged on its own, as Acrobat judges it: the certification reads changed, the timestamp does not inherit its limit.

**What Acrobat adds to a page no longer reads as a forbidden change because of where the page keeps its annotation list.** Acrobat keeps a page's `/Annots` as an object of its own. A document timestamp, a signature in a new field or a comment added after a signature read `forbidden` for the earlier signature in two cases, and now read `permitted`, as they do when the list is an array inside the page:

- the list moves out of the page into an object of its own, with the new signature field's widget (what Acrobat does the first time);
- the list already is an object of its own and grows there.

One case still reads `forbidden`, with a reason that says so: Acrobat points the page at a new list object and leaves the old one in the file unwritten. The analysis cannot read the old list then, so it cannot show that nothing was dropped.

`SIGNATURE_POLICY_VERSION` is 5. For a certification at level 2 or 3 and for approval signatures nothing changes.
