---
'@embedpdf/plugin-signature': minor
---

The signature plugin now follows the 3.0 public contract.

- Reads are `getSnapshot`, `getStatus`, `listSignatures`, `listUnsignedFields`, `getSignature` (was `signatureOf`), `listVerdicts` (was `verdicts`), `getVerdict` (was `verdictOf`), `getProtection`, `getPending`, `isBusy`, `getMode` and `getTarget`.
- `sign` replaces `signField` and accepts a per-call `signer`; `prepareSignature` / `completeSignature` / `abortPending` expose two-phase signing; `placeMark` returns a `PlaceMarkResult`; `validateField`, `analyzeChanges` (was `analyze`) and `readRevision` (was `revisionBytes`, by field or revision index) are new or renamed; `requestInspection` replaces `inspect`.
- `onChanged` is replaced by `onSigned`, `onFilled`, `onCleared`, `onValidated`, `onProtectionChanged`, `onInvalidating`, `onTargetChanged`, `onSignRequested` and `onInspectionRequested`.
- Refusals are `PluginError`s (`not-ready`, `unsupported`, `invalid-input`, `not-found`, `conflict`).
- `createArmedMarkHandler` moved to `@embedpdf/plugin-signature/internal`; the package gains `./contract/host` and `./internal` entries. React's `useSignatureEvent` takes a hook selector.
