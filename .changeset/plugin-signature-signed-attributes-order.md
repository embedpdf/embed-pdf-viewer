---
'@embedpdf/plugin-signature': patch
---

A PKCS#7 signature's signed attributes are in DER order. With `subFilter: 'adbe.pkcs7.detached'` the signing time was written after the message digest, where DER puts it before. A reader that encodes the attributes again before it checks the signature now gets the bytes that were signed. Signatures made before still verify.
