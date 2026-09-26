# @embedpdf/plugin-signature

Document-scoped digital signing for EmbedPDF v3: sign a signature field with a
**mark** (a stamp-library asset — drawn, typed, uploaded — or bytes you bring)
through a **signer port** you configure; fill a field visually without
sealing; validate what is signed; and drop an armed mark onto a field.

The plugin owns the act and nothing else:

- marks are the stamp plugin's (`@embedpdf/plugin-stamp`) — one library of kind
  `signatures` per person, holding a `signature` asset and optional `initials`;
- the key is a `SignerPort` from `@embedpdf/core-signature` (`webCryptoSigner`,
  `remoteSigner`, `personalSigner`), resolved per signing;
- the engine draws the mark's page into the field and seals the bytes
  (`doc.signatures.prepare` → CMS → `complete`); on the cloud the server
  publishes the new version.

```ts
import { signaturePlugin, personalSigner, indexedDbKeyStore } from '@embedpdf/plugin-signature';

signaturePlugin({
  signer: () => personalSigner({ subject: 'Ada Lovelace', store: indexedDbKeyStore('keys') }),
  trust: { anchors: async () => [rootCertificateDer] },
  mode: 'sign', // 'sign' (default with a signer) | 'visual' (default without) | 'ask'
});

const signature = ctx.get(SignatureToken);
await signature.placeMark({ assetId }, { field: { kind: 'fqn', name: 'sig' } }); // sign / fill / ask, by mode
await signature.placeMark({ assetId }, { pageObjectNumber, at: { x: 120, y: 90 } }); // elsewhere: a stamp
```

With the interaction hub and the stamp plugin present, a mark armed from a
`signatures` library and clicked over an unsigned signature field goes into
the field; anywhere else it is placed as a stamp.

Requires `@embedpdf/plugin-form`; optional `@embedpdf/plugin-stamp`,
`@embedpdf/plugin-annotation`, `@embedpdf/plugin-interaction`. See the docs
page `headless/plugins/signature` for the full contract.
