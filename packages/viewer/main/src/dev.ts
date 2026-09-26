/**
 * Dev harness — the vanilla one-liner plus one rung of each door, so
 * `pnpm dev` in this package always exercises the whole boundary:
 * init → element → preact chrome → engine worker, the config pass-through,
 * and the drive door (el.viewer from plain page script).
 */
import EmbedPDF, { AnnotationToken, indexedDbKeyStore, personalSigner } from './doors/local';

// The signatures rung: one self-signed identity kept in this browser, trusted
// by the viewer itself so its own signatures validate as 'valid'.
const signer = personalSigner({
  subject: 'Dev signer',
  store: indexedDbKeyStore('embedpdf-dev-keys'),
});

const element = EmbedPDF.init({
  target: '#viewer',
  src: '/ebook.pdf',
  signatures: {
    key: () => signer,
    trust: { anchors: async () => [(await signer).certificate] },
    allowCertify: true,
  },
  // The annotation-fonts rung: fonts beyond the standard 14, fetched from
  // this harness, registered on the engine and mounted for the live editor.
  annotations: {
    fonts: [
      { key: 'roboto', url: '/fonts/Roboto-Regular.ttf', label: 'Roboto', familyName: 'Roboto' },
    ],
  },
});
