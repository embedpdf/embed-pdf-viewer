# @embedpdf/plugin-signature

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A free placement in `placeMark()` puts the mark's middle on `center` (was `at`), and takes a page as a ref or an index; it places through the annotation plugin's `stamps.place()`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The signature plugin now follows the 3.0 public contract.
  - Reads are `getSnapshot`, `getStatus`, `listSignatures`, `listUnsignedFields`, `getSignature` (was `signatureOf`), `listVerdicts` (was `verdicts`), `getVerdict` (was `verdictOf`), `getProtection`, `getPending`, `isBusy`, `getMode` and `getTarget`.
  - `sign` replaces `signField`; it takes a per-call `key` and the signature facts as `signer` (the configured key is `key` too); `prepareSignature` / `completeSignature` / `cancelPending` expose two-phase signing; `placeMark` returns a `PlaceMarkResult`; `validateField`, `analyzeChanges` (was `analyze`) and `readRevision` (was `revisionBytes`, by field or revision index) are new or renamed; `requestInspection` replaces `inspect`.
  - `onChanged` is replaced by `onSigned`, `onFilled`, `onCleared`, `onValidated`, `onProtectionChanged`, `onInvalidating`, `onTargetChanged`, `onSignRequested` and `onInspectionRequested`.
  - Refusals are `PluginError`s (`not-ready`, `unsupported`, `invalid-input`, `not-found`, `conflict`).
  - `createArmedMarkHandler` moved to `@embedpdf/plugin-signature/internal`; the package gains `./contract/host` and `./internal` entries. React's `useSignatureEvent` takes a hook selector.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Rights per field: `canSign(field)` and `canFill(field)` take the field, and signing, filling and clearing a field are refused for a field the user may not sign or fill in (`fields:sign:group=seller`). The annotation plugin is optional: placing a mark as a stamp without it is refused as `unsupported`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The signature capability has the shared plugin contract. Settings: `signaturePlugin({ key, mode, trust, allowCertify })` with `getSettings`, `updateSettings`, `resetSettings` and `onSettingsChanged`; a change applies at once (a new `key` or `trust` port replaces the old one whole), and `getMode()` follows it. `signatureState` declares the State table (`signatures`, `protection`, `target`, `busy`, `pending`, `status`), and `listSignatures()` gives each signed field with its `verdict` from the last check (`SignatureInfo`).

  `onInvalidating` is `onInvalidationPredicted`, and `onFilled` and `onCleared` carry `SignatureFilledEvent` and `SignatureClearedEvent`. `canSign()` is the `doc.sign` permission alone (a per-call key or two-step signing needs no `key` setting), and the new `canReadRevision()` is `doc.download`. `sign`, `prepareSignature` and `completeSignature` are refused up front without `doc.sign` (and `doc.sign.certify` to certify), `fillField` and `clearField` without `doc.forms.fill`, `readRevision` without `doc.download`, each naming the permission. Every async verb takes a `signal`: a signal that fires before `sign()` seals leaves nothing signed. A target set with one kind of field ref is cleared when the field is signed through the other.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onSigned` carries the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A signature field is addressed by its field ref, or by its widget: the widget's annotation ref or the `FormWidget` a signature names (`signature.widget`). A bare `{ objectNumber }` is no longer accepted.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A parked two-phase signing that the engine no longer knows (its abort answers `unknown`) is dropped from `getPending()` instead of staying parked forever.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – New: `signerRowsOf(libraries, assets)` and its `SignerRow` type, the people in a signatures picker (one row per stamp library of kind `signatures`, with the person's signatures and initials), derived from the stamp plugin's lists. Every framework's `useSignerRows()` is built on it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the interaction and annotation contracts (host priorities from `/contract/host`). Signature resolves widgets through `getFieldForWidget` / `getWidgetAt`. Signature reads stamps through `getArmedAsset`, `getLibrary` and `readAssetBytes`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Follows the removal of `forms.imported`: a form import now fires one `forms.created` or `forms.valueSet` per field.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Adapt the armed-mark handler to the form plugin's `PageRef`-addressed widget lookup.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An annotation reorder counts as an edit of the working copy (`annotations.reordered`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A free placement of a mark goes through the stamp plugin's `placeAsset(assetId, placement, { documentId })`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The signature cryptography (`@embedpdf/core-signature`, with PKI.js) loads the first time a signature is checked or a document is signed, instead of with the plugin, so an app that registers the plugin pays for it only when a document carries signatures or someone signs.

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Introduce a headless signature plugin with digital signing, visual-only filling, and application-controlled confirmation modes. Place marks into signature fields or as free stamps, support certification and field locks, and configure external signers and trust anchors.

  Expose signature snapshots, validation verdicts, document protection, signed revision downloads, and events for signing, inspection, and edits that would invalidate a signature. Reuse stamp libraries for signature and initials artwork.
