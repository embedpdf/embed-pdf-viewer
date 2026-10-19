/**
 * The demo-document registry: which document each sample opens, per engine
 * flavor. A sample's source file carries the LOCAL form between
 * `// [!doc-source <key>]` markers; the sync generator swaps the whole block
 * for the flavor's form when emitting a cloud site's copy.
 *
 * Cloud share tokens reference live grants on engine.cloudpdf.com, managed
 * in the dashboard — revoking or editing a grant retargets every docs code
 * panel (and, later, live demo) at the next renewal.
 */

/** The share grant of the docs' demo ebook on CloudPDF SaaS. */
const EBOOK_SHARE_TOKEN = 'shr_WGj1goAtlNN_fQ5OswPrbJQM';

export const DEMO_DOCUMENTS = {
  ebook: {
    /** `const <name> = …` emitted for the cloud flavor of a headless sample: an engine open input. */
    cloudSource: (name) =>
      `const ${name}: OpenInput = { kind: 'share', shareToken: '${EBOOK_SHARE_TOKEN}' };`,
    /**
     * The ready-made viewer's samples and snippets: the cloud site's copy gives this document as
     * the cloud viewer's `src` (`{ token }`, `{ id }` or `{ shareToken }`) where embedpdf.com's
     * gives one of `viewerUrls`. A `[!doc-source ebook]` block keeps its declaration and gets
     * this value; a `src` that names one of the URLs gets it in the binding its place needs. A
     * per-site file (`*.cloud.vanilla.html`) writes it as is: the sync fails on a share grant
     * that isn't one of these, so a new grant here finds each copy of the old one.
     */
    viewerCloud: `{ shareToken: '${EBOOK_SHARE_TOKEN}' }`,
    /** The demo file itself, and `/report.pdf`, the path the snippets give for a reader's own PDF. */
    viewerUrls: ['https://snippet.embedpdf.com/ebook.pdf', '/report.pdf'],
  },
};
