---
'@embedpdf/core-signature': minor
---

`pkijs` 4 and `asn1js` 4. Both are ES modules only and no longer use `pvtsutils`, the one CommonJS module this package brought along. An Angular production build no longer warns that `pvtsutils` is not ESM, and an `allowedCommonJsDependencies` entry for it can go.

**In Node, this package needs Node 22.12 or newer, or 20.19 or newer on Node 20.** That is what the two libraries ask for.

- `import` works as before.
- `require()` works on those Node versions, where Node loads an ES module through `require()`. On Node 20 before 20.19 and Node 22 before 22.12 it fails with `ERR_REQUIRE_ESM`.
- TypeScript that compiles to CommonJS needs `"module": "node20"` or `"nodenext"`. With `"node16"` it reports `TS1479` in this package's type declarations, unless `skipLibCheck` is on.
- Jest in its CommonJS mode needs the libraries transformed: `transformIgnorePatterns: ['/node_modules/(?!(pkijs|asn1js|bytestreamjs|@peculiar/utils|@noble/hashes)/)']`.

**A time from 2050 on is written as GeneralizedTime.** A signing time (`subFilter: 'adbe.pkcs7.detached'`), and the dates of the certificates and revocation lists this package makes, were always written as UTCTime, which ends with the year 2049: a signing time in 2050 was written as 1950. RFC 5652 and RFC 5280 have a later time as GeneralizedTime. Times are written to the second.
