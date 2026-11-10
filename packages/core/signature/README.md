<!-- Generated from docs/content/engine/forms/signatures.mdx by docs/content/scripts/readmes.mjs. Edit there, then run `pnpm readme:sync`. -->

# @embedpdf/core-signature

Digital signatures for EmbedPDF: signs a PDF and validates the signatures it has. No DOM.

## Digital signatures

A digital signature seals a PDF as it was at the moment of signing. The engine reads every
signature in a document, tells you what changed after it, and signs a field for you. It never
sees your private key: it hands you the fingerprint of the file (a digest), your key signs it,
and the engine writes the result into the PDF.

```ts
import { sign, webCryptoSigner } from '@embedpdf/core-signature';

const { signatures } = await doc.signatures.list();
const field = signatures.find((signature) => !signature.signed)!.field;

await sign(doc, {
  field,
  key: webCryptoSigner({ privateKey, certificateChain }),
  signer: { name: 'Ada Lovelace', reason: 'Approved' },
});
```

Signing needs `doc.sign`, and `doc.forms.read` to find the field with `list()`; see
[Permissions](https://www.embedpdf.com/docs/engine/forms/signatures#permissions).

The cryptography (building a signature from a key, checking one against its certificate) lives
in its own package, which works with both engines:

```sh
npm install @embedpdf/core-signature
```

## Documentation

- [Digital signatures](https://www.embedpdf.com/docs/engine/forms/signatures): Check who signed a PDF and what changed since, sign a signature field with your own key or signing service, and certify a document.

## License

Apache-2.0
