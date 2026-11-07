/**
 * The demo-document registry: which document each sample opens, per engine
 * flavor. A sample's source file carries the LOCAL form between
 * `// [!doc-source <key>]` markers; the sync generator swaps the whole block
 * for the flavor's form when emitting a cloud site's copy.
 *
 * Cloud samples open live grants on engine.cloudpdf.com, made by
 * `pdfs:cloud` and recorded in `pdfs/cloud.json` — editing a grant retargets
 * every docs code panel (and, later, live demo) at the next renewal.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * The grants `pdfs:cloud` made on CloudPDF SaaS, by document: each gives every visit its own copy
 * of the document, so a reader can change whatever the examples change without touching anyone
 * else's.
 */
const CLOUD_GRANTS_FILE = new URL('./pdfs/cloud.json', import.meta.url);
const CLOUD_GRANTS = existsSync(CLOUD_GRANTS_FILE)
  ? JSON.parse(readFileSync(CLOUD_GRANTS_FILE, 'utf8'))
  : {};

/**
 * Until `pdfs:cloud` has made a document's grant: the read-only grant every cloud sample opened
 * before, which holds the old demo ebook.
 */
const READ_ONLY_GRANT = 'shr_WGj1goAtlNN_fQ5OswPrbJQM';

/** A document's grant on CloudPDF SaaS. */
const grantOf = (key) => CLOUD_GRANTS[key]?.grant ?? READ_ONLY_GRANT;

/**
 * Where each site serves the demo documents: `pdfs/build.mjs` writes the same files into both
 * sites' `public/pdfs/`, each with its own brand's welcome. Docs code gives a document by its full
 * URL on embedpdf.com, never a site-relative one, so code a reader copies opens it on their own
 * page too; a flavor's copy names its own site (the sync's `swapDocumentSite`).
 */
export const DOCUMENT_SITES = {
  local: 'https://www.embedpdf.com',
  cloud: 'https://www.cloudpdf.com',
};

/** A demo document's file as docs code names it: its full URL on embedpdf.com. */
const documentUrl = (file) => `${DOCUMENT_SITES.local}/pdfs/${file}`;

/**
 * A document as the ready-made viewer's samples give it: the cloud viewer's `src` on cloudpdf.com,
 * and the URL embedpdf.com's copy gives it at (see `welcome`).
 */
const viewerForms = (key) => ({
  viewerCloud: `{ grant: '${grantOf(key)}' }`,
  viewerUrls: [documentUrl(`${key}.pdf`)],
});

/** `const <name> = …` emitted for the cloud flavor of a headless sample: an engine open input. */
const cloudSource = (key) => (name) =>
  `const ${name}: OpenInput = { kind: 'grant', grant: '${grantOf(key)}' };`;

export const DEMO_DOCUMENTS = {
  welcome: {
    cloudSource: cloudSource('welcome'),
    /**
     * The ready-made viewer's samples and snippets: the cloud site's copy gives this document as
     * the cloud viewer's `src` (`{ token }`, `{ id }` or `{ grant }`) where embedpdf.com's
     * gives one of `viewerUrls`. A `[!doc-source welcome]` block keeps its declaration and gets
     * this value; a `src` that names one of the URLs gets it in the binding its place needs. A
     * per-site file (`*.cloud.vanilla.html`) names one of the URLs too, so it gets the grant here;
     * the sync fails on a grant in it that isn't one of these.
     */
    viewerCloud: `{ grant: '${grantOf('welcome')}' }`,
    /** The demo file: the samples open it, and the snippets give it where a reader's own PDF goes. */
    viewerUrls: [documentUrl('welcome.pdf')],
    /**
     * Characters on the cover the samples select, in each site's welcome, by the name a
     * `[!doc-range welcome <name>]` block gives: `text` is what they read. The brand's tagline
     * comes before the title in the cover's text, and CloudPDF's is longer, so the title starts 8
     * characters later on cloudpdf.com. The PDF build fails when a range no longer reads its text.
     */
    ranges: {
      firstWord: {
        text: 'Documents',
        local: { start: 28, count: 9 },
        cloud: { start: 36, count: 9 },
      },
    },
  },
  links: { cloudSource: cloudSource('links'), ...viewerForms('links') },
  forms: { cloudSource: cloudSource('forms'), ...viewerForms('forms') },
  report: { cloudSource: cloudSource('report'), ...viewerForms('report') },
  proposal: { cloudSource: cloudSource('proposal'), ...viewerForms('proposal') },
  layout: { cloudSource: cloudSource('layout'), ...viewerForms('layout') },
  notice: { cloudSource: cloudSource('notice'), ...viewerForms('notice') },
  approvals: { cloudSource: cloudSource('approvals'), ...viewerForms('approvals') },
  article: {
    cloudSource: cloudSource('article'),
    ...viewerForms('article'),
    /**
     * Characters on the cover the samples select, by the name a `[!doc-range article <name>]`
     * block gives: `text` is what they read. A made-up company's document is the same on both
     * sites, so both read the same characters. The letterhead's "Engineering blog" comes before
     * the title in the cover's text.
     */
    ranges: {
      firstLine: {
        text: 'How the first page of a large PDF',
        local: { start: 18, count: 33 },
        cloud: { start: 18, count: 33 },
      },
    },
  },
  sketch: { cloudSource: cloudSource('sketch'), ...viewerForms('sketch') },
  invoice: { cloudSource: cloudSource('invoice'), ...viewerForms('invoice') },
  registration: { cloudSource: cloudSource('registration'), ...viewerForms('registration') },
  agreement: { cloudSource: cloudSource('agreement'), ...viewerForms('agreement') },
};
