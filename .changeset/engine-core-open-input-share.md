---
'@embedpdf/engine-core': minor
---

Adds `share` to the `OpenInput` union and a `SharePasswordRequired` engine error code.

- `OpenInputShare` (`{ kind: 'share', shareToken, sharePassword?, password? }`) is the third cloud reference form, alongside `id` and `token`: a public share token from the dashboard's embed snippet, resolved by the cloud engine itself. Rejected by `@embedpdf/engine`, like the other cloud kinds.
- `sharePassword` is the grant's passphrase (checked at exchange); `password` stays the PDF's own encryption password, same slot as every other kind.
- `EngineErrorCode.SharePasswordRequired` is the prompt-and-retry signal for protected grants — the share sibling of `DocPasswordRequired`.
