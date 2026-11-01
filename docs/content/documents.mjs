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
    /** The demo file itself, and `/report.pdf`, the path the snippets give for a reader's own PDF. */
    viewerUrls: ['/pdfs/welcome.pdf', '/report.pdf'],
  },
  links: { cloudSource: cloudSource('links') },
  forms: { cloudSource: cloudSource('forms') },
  report: { cloudSource: cloudSource('report') },
  proposal: { cloudSource: cloudSource('proposal') },
  layout: { cloudSource: cloudSource('layout') },
  notice: { cloudSource: cloudSource('notice') },
  approvals: { cloudSource: cloudSource('approvals') },
  article: { cloudSource: cloudSource('article') },
  sketch: { cloudSource: cloudSource('sketch') },
  invoice: { cloudSource: cloudSource('invoice') },
  registration: { cloudSource: cloudSource('registration') },
  agreement: { cloudSource: cloudSource('agreement') },
};
