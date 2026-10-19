---
'@embedpdf/plugin-signature': minor
---

The signature capability has the shared plugin contract. Settings: `signaturePlugin({ key, mode, trust, allowCertify })` with `getSettings`, `updateSettings`, `resetSettings` and `onSettingsChanged`; a change applies at once (a new `key` or `trust` port replaces the old one whole), and `getMode()` follows it. `signatureState` declares the State table (`signatures`, `protection`, `target`, `busy`, `pending`, `status`), and `listSignatures()` gives each signed field with its `verdict` from the last check (`SignatureInfo`).

`onInvalidating` is `onInvalidationPredicted`, and `onFilled` and `onCleared` carry `SignatureFilledEvent` and `SignatureClearedEvent`. `canSign()` is the `doc.sign` permission alone (a per-call key or two-step signing needs no `key` setting), and the new `canReadRevision()` is `doc.download`. `sign`, `prepareSignature` and `completeSignature` are refused up front without `doc.sign` (and `doc.sign.certify` to certify), `fillField` and `clearField` without `doc.forms.fill`, `readRevision` without `doc.download`, each naming the permission. Every async verb takes a `signal`: a signal that fires before `sign()` seals leaves nothing signed. A target set with one kind of field ref is cleared when the field is signed through the other.
