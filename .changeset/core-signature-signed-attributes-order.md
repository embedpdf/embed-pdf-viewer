---
'@embedpdf/core-signature': patch
---

A PKCS#7 signature's signed attributes are in DER order. `sign(doc, { subFilter: 'adbe.pkcs7.detached' })` wrote its signed attributes, and signed them, in the order content type, message digest, signing time. DER puts the signing time before the message digest, and RFC 5652 has the signature made over the attributes in DER. They are now sorted before they are signed, so a reader that encodes them again before it checks the signature gets the bytes that were signed.

- The default, `'ETSI.CAdES.detached'`, was in DER order already, and so was the test timestamp authority's token.
- A signature made before still verifies here: it is checked over the order it was written in.
