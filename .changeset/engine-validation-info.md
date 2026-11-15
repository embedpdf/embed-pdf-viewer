---
'@embedpdf/engine': minor
---

Add `doc.signatures.getValidationInfo()` and `doc.signatures.addValidationInfo()`.

A PDF keeps what a reader needs to check its signatures later with no network in its document security store: certificates, OCSP responses and CRLs. Acrobat calls a signature whose data is there "LTV enabled".

```ts
const stored = await doc.signatures.getValidationInfo();
stored.certificates; // DER bytes, one per certificate

const result = await doc.signatures.addValidationInfo({
  ocspResponses: [answer],
});
result.added; // { certificates: 0, ocspResponses: 1, crls: 0 }
```

- `addValidationInfo()` stores nothing the document already holds, and nothing at all when an entry is not one DER object (`InvalidArg`).
- What it stores is in the file at the next save, as a revision after the signatures, so they still verify. A signature made after it seals it in. It has no undo.
- It needs `doc.sign`, and fails with `ProtectedDocument` after a certification that allows no changes.
- It fires `signatures.validationInfoAdded` when it stored something.

A document timestamp needs no field: `doc.signatures.prepare({ kind: 'timestamp' })` with no `field` makes one for it, with no size, so it shows nowhere on the page. The field is added in the same revision as the timestamp, and `prepared.field` names it.

A signature field or document timestamp that Acrobat adds to a page whose annotation list is an object of its own now reads `permitted` for the earlier signatures, as Acrobat reads it.
