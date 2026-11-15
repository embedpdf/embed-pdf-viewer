---
'@embedpdf/plugin-signature': minor
---

The `timestampAuthority` setting: every signature the plugin seals then carries a timestamp from that authority, in one step and in two, and a timestamp that can't be had fails the signing. `sign()` and `prepareSignature()` take a per-call `timestampAuthority`; `null` seals that one without a timestamp. With the `trust` setting set, a timestamp from an authority it doesn't cover is not sealed.

`completeSignature()` checks the CMS against what was prepared before it seals anything, where it handed it to the engine as it was: a CMS that doesn't sign the prepared digest is refused instead of written. When it fails, the signing stays prepared, to complete again or to cancel.

`validate()` takes `validationTime: { kind: 'earliest-timestamp' }`, and a verdict carries its signature's timestamp in `timestamp`. `httpTimestampAuthority` and `createTestTimestampAuthority` come with the plugin's exports, beside the signers.
