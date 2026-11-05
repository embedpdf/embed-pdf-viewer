---
'@embedpdf/engine-core': minor
---

Names, units and flags follow one rule (naming.md, "The HTTP API"):

- **Flags are named booleans.** A `submit-form` action reads and writes `exclude`, `includeNoValueFields`, `format`, `method` and the rest flat on its payload or action, without a `flags` object or a raw word; `encodeSubmitFormFlags` is the inverse of `decodeSubmitFormFlags`. An action tree drops `warningFlags` (its `warnings` name them). A seed value says `filterRequired`, `subFiltersRequired`, `parserVersionRequired`, `digestMethodsRequired` and `reasonsRequired` instead of `requiredFlags` and `presentFlags`, and its `version` is `parserVersion`. A form submission's intent drops `flagsRaw`.
- **One name, one meaning.** Mutation results list what they touched in `changedRefs` (was `changed`).
- **Units and algorithms in names.** An attachment's `size` and `checksum` are `sizeBytes` and `md5`; a font program's `displayHash` and `sourceHash` are `displaySha256` and `sourceSha256`; a version's `byteLength` is `sizeBytes`; a signature's `contentsSize` (and `prepare`'s) is `contentsSizeBytes`; the head, the manifest and the version list say `baseSha256`, the head `sizeBytes` and the manifest `baseSizeBytes` (was `baseByteLength`); an editing session's `expiresIn` (`EditSessionAccess`, `EditSessionStatus`, an object-number reservation) is `expiresInSeconds`.
- **Path parameters are spelled out** in `wireTemplates`: `:annotationKey`, `:sha256` and `:displaySha256`. The `document.fonts.program` worker request names its program by `displaySha256`, and `signatures.finalizeCandidate` takes `contentsSizeBytes`.
