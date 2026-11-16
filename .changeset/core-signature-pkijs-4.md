---
'@embedpdf/core-signature': minor
---

`pkijs` 4 and `asn1js` 4. Both are ES modules only and no longer use `pvtsutils`, the one CommonJS module this package brought along. An Angular production build no longer warns that `pvtsutils` is not ESM, and an `allowedCommonJsDependencies` entry for it can go.

**CommonJS works as before.** `require()` does not load an ES module on every Node, or in Jest, so the CommonJS files of this package hold the two libraries and the three they use.

- `require('@embedpdf/core-signature')` loads no ES module, and neither does a package that loads it. Jest in its CommonJS mode needs no configuration.
- The type declarations for CommonJS hold the libraries' types, so TypeScript that compiles to CommonJS reads them with any `module` setting.
- `dist/THIRD-PARTY-NOTICES.txt` lists what the files hold, with each version and license, and `inlinedDependencies` in `package.json` has the versions.
- The CommonJS files are about 930 kB, where they were 180 kB. The ES module files import the libraries as before.

**In Node, the two libraries ask for Node 22.12 or newer, or 20.19 or newer on Node 20.** npm warns when it installs them on an older one.

**A time from 2050 on is written as GeneralizedTime.** A signing time (`subFilter: 'adbe.pkcs7.detached'`), and the dates of the certificates and revocation lists this package makes, were always written as UTCTime, which ends with the year 2049: a signing time in 2050 was written as 1950. RFC 5652 and RFC 5280 have a later time as GeneralizedTime. Times are written to the second.
