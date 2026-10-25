/**
 * Dev harness — the vanilla one-liner plus one rung of each door, so
 * `pnpm dev` in this package always exercises the whole boundary:
 * init → element → preact chrome → engine worker, the config pass-through,
 * and the viewer in code (el.viewer from plain page script).
 */
import EmbedPDF, {
  indexedDbKeyStore,
  personalSigner,
  type EmbedPdfViewerElement,
} from './doors/local';

// The signatures rung: one self-signed identity kept in this browser, trusted
// by the viewer itself so its own signatures validate as 'valid'.
const signer = personalSigner({
  subject: 'Dev signer',
  store: indexedDbKeyStore('embedpdf-dev-keys'),
});

const element = EmbedPDF.init({
  target: '#viewer',
  src: '/ebook.pdf',
  // The fonts rung: a font beyond the standard 14, fetched from this harness,
  // registered on the engine and offered in the style panel.
  fonts: [{ key: 'roboto', url: '/fonts/Roboto-Regular.ttf', familyName: 'Roboto' }],
  // The plugins rung: a plugin's settings by its name, over the viewer's own, and the
  // signatures rung under the signature plugin's.
  plugins: {
    search: { highlight: { color: '#a7f3d0' } },
    signature: {
      key: () => signer,
      trust: { anchors: async () => [(await signer).certificate] },
      allowCertify: true,
    },
  },
});

// The code rung: plugins by name, and the live props from the console
// (`viewerElement.theme = 'dark'`, `viewerElement.readOnly = true`).
element.addEventListener('epdf:ready', () => {
  element.viewer?.documents.onOpened(({ documentId }) => {
    const pages = element.viewer?.get('documents').get(documentId)?.pageCount;
    console.info(`[dev] opened ${documentId}: ${pages ?? '?'} pages`);
  });
});
declare global {
  interface Window {
    viewerElement?: EmbedPdfViewerElement;
  }
}
window.viewerElement = element;
