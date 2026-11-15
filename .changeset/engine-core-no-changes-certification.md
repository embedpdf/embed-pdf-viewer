---
'@embedpdf/engine-core': minor
---

Read and store the validation data of a document, and judge two cases the way Acrobat does.

**`doc.signatures.getValidationInfo()` and `doc.signatures.addValidationInfo()`.** A PDF keeps what a reader needs to check its signatures later with no network in its document security store (`/DSS`): certificates, OCSP responses and CRLs.

- `getValidationInfo()` returns them as `{ certificates, ocspResponses, crls }`, each entry as DER bytes, once. It reads the document as it is now, so an entry that was added and not yet saved is among them. It needs `doc.forms.read`.
- `addValidationInfo(input)` stores entries and returns `{ added, meta }`, where `added` counts the new ones of each kind. An entry the document already holds, byte for byte, is not stored again.
  - Each entry must be one DER object of at most 16 MiB (`VALIDATION_INFO_LIMITS.entryBytes`). Otherwise the call fails with `InvalidArg`, `details.field` names the entry, and nothing is stored. What an entry says is not checked.
  - It is a change of the document: it is in the file at the next save, as a revision after the signatures, and a signature made after it seals it in. It has no undo (`meta.undoable` is `false`), and undoing another change leaves it in place.
  - It needs `doc.sign`. After a certification that allows no changes it fails with `ProtectedDocument`.
  - It fires `signatures.validationInfoAdded`, with `added`, when it stored something.
- New exports: the types `ValidationInfo`, `ValidationInfoAddResult`, `ValidationInfoCounts` and `ValidationInfoKind`, `VALIDATION_INFO_KINDS`, `VALIDATION_INFO_LIMITS`, and `validationInfoEntryProblem()`, which says why bytes are not an entry the engine stores.

**A certification that allows no changes (`permission: 1`) allows no later revision.** The PDF standard lets validation data and a document timestamp follow one, and the engine did too. Acrobat reports such a certification as invalid once anything is added, so:

- `analyze()` and `validateSignatures()` read every object written after it as `forbidden`, with the rule `no-changes-certification`. Validation data and a document information dictionary read `permitted` before.
- The engine refuses signing, a document timestamp included, and metadata changes on such a document, with `ProtectedDocument`. `doc.security.allows('doc.sign')` is `false` there. `signedDocumentPolicy: 'permit'` still turns the refusals off.
- A document timestamp that was added after such a certification is judged on its own, as Acrobat judges it: the certification reads changed, the timestamp does not inherit its limit.

**What Acrobat adds to a page no longer reads as a forbidden change because of where the page keeps its annotation list.** Acrobat keeps a page's `/Annots` as an object of its own. A document timestamp, a signature in a new field or a comment added after a signature read `forbidden` for the earlier signature in three cases, and now read `permitted`, as they do when the list is an array inside the page:

- the list moves out of the page into an object of its own, with the new signature field's widget (what Acrobat does the first time);
- the list already is an object of its own and grows there;
- the page is pointed at a new list object and the old one stays in the file, unwritten (what Acrobat does for a second timestamp). No later revision holds the old list, so the engine reads it from the earlier revision.

For that third case an engine hands the rules the objects they ask for: `unwrittenObjectsToRead()` names them, and `StepInput.unwritten` carries them (`UnwrittenObject`). Without them such a page reads `forbidden`, with a reason that says the earlier list could not be read.

`SIGNATURE_POLICY_VERSION` is 5. For a certification at level 2 or 3 and for approval signatures nothing changes.
