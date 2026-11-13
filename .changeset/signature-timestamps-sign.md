---
'@embedpdf/core-signature': minor
---

`sign()` takes `timestampAuthority`: the signature then carries an RFC 3161 timestamp from that authority, stored inside the signature. A timestamp that can't be had fails the signing, so nothing is signed without it. `timestampTrust` refuses a token from an authority that trust port doesn't cover. With a `timestampAuthority`, `sign()` reserves 16384 bytes for the signature unless `contentsSizeBytes` says otherwise.

`completeSignature(doc, { prepared, cms })` is the second half of `sign()`, for signing in two steps: it checks the CMS against what was prepared, adds the timestamp when asked, and completes. A failure leaves the signing prepared. `attachSignatureTimestamp({ cms, authority })` adds a timestamp to a finished CMS and leaves every other byte of it as it was, also for a CMS written with indefinite lengths.

The completion gate checks a timestamp a CMS already carries, such as a signing service's: one that provably stamps something other than the signature is refused. When a signature doesn't fit the room reserved for it, the refusal names the `contentsSizeBytes` to prepare with.

A CMS key may declare a `hash`, which `sign()` takes as its default digest, as it takes a raw key's. `ecdsaRawFromDer()` turns the DER ECDSA signature most signing services return into the `r || s` a raw key returns.
