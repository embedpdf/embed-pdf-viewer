---
'@embedpdf/engine-core': minor
---

Responses are read tolerantly, as `docs/conventions/api-evolution.md` asks, so a client keeps working against a newer server. No schema a response is parsed with refuses a field it doesn't know any more, nested ones included (`LineLeaderSchema`, a measure's `origin`, `IdentitySchema`, `RedactionApplyScopeSchema`, `BundleLimitsSchema`, `ImageResourceKeysSchema`); requests are still parsed strictly, with `LineLeaderWriteSchema`, `IdentityInputSchema` and `RedactionApplyScopeInputSchema`.

An annotation of a subtype the client doesn't know reads as `unsupported` instead of failing the whole list, keeping the fields every annotation has, with `rawSubtypeCode` and `rawSubtypeName` from the body when it carries them and `0` and `null` when it doesn't. A subtype the client knows with a malformed body still fails. The other sets with a catch-all read the same way: an error `code` as `Unknown`, a widget's `fieldFamily` and a form field's `family` as `unknown`, a measure as `unknown`, a link or outline target as `unsupported`, an action as `unknown` and a field's value entry as `unsupported`.

Every other enum, literal and union a response carries is marked closed with the new `closed()`, next to `readsUnknownAs()` and `withCatchAll()` for open ones, and `readingProblems()` and `withUnknownFields()` in `@embedpdf/engine-core/conformance` check a schema against the convention.
