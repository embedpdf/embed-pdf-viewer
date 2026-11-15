---
'@embedpdf/viewer-chrome': minor
---

The signature inspector says how a signature will hold up. A **Revocation** line shows when the file holds an answer about the signer's certificate: not revoked, or revoked. A **Long-term validation** line says whether the file holds everything a reader needs to check the signature with no network: enabled, with the day that proof runs out, or not enabled, with what is missing. For a signature that isn't enabled, **Add verification information** asks for the answers and stores them, when the `revocation` and `trust` settings are set and the person may sign.

When a signature is sealed and its verification information can't be added, the sign dialog and the signatures panel say so: the document is signed, and the inspector offers to add it later.

The details of a signature whose box has no size, such as a document timestamp's, open at the corner of the viewer and no longer at a point on the page.

Seventeen new strings, in all fifteen languages. `httpRevocationSource` and `createTestCertificateAuthority` are exported beside the signers.
