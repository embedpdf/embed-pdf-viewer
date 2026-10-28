/**
 * Puts the docs' demo PDFs on CloudPDF, so cloudpdf.com's examples open the same documents as
 * embedpdf.com's, with CloudPDF's own welcome. For each document `build.mjs` makes, it uploads
 * cloudpdf.com's copy, `cloudpdf/website/public/pdfs/<folder>.pdf`, and creates a share link for
 * it, then records both in `cloud.json`, which `documents.mjs` reads. Run
 * `CLOUDPDF_API_TOKEN=… CLOUDPDF_TENANT_ID=… pnpm --filter @embedpdf/docs-content pdfs:cloud`;
 * `--dry-run` only says what it would do. `CLOUDPDF_BASE_URL` names another engine than
 * engine.cloudpdf.com.
 *
 * Every link gives each visit its own copy of the document, as embedpdf.com's examples do in
 * memory: a reader's changes are theirs, nobody sees anyone else's, and a reload starts clean.
 * A copy nobody has looked at for an hour is deleted. Each link may do what its document's
 * examples do, from any origin, since copied code runs on the reader's own machine. It takes a
 * name if the page gives one, never asking for it: an example's `identity` names what it adds,
 * as on embedpdf.com.
 *
 * A document already in `cloud.json` keeps its link, and the link is set to these settings again,
 * so editing them here and running again updates every link. One whose PDF changed since is
 * reported, not replaced: a link can't point at a new document yet, and a new link means a new
 * token in every cloud copy.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CloudPDFClient } from '@cloudpdf/sdk';

const here = dirname(fileURLToPath(import.meta.url));
const pdfs = resolve(here, '../../../cloudpdf/website/public/pdfs');
const record = join(here, 'cloud.json');

/** What every reader may do with any document: everything that reads. */
const READ = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.search',
  'doc.text.copy',
  'doc.content.copy',
  'doc.annotate.read',
  'doc.forms.read',
  'doc.download',
  'doc.download.flattened',
  'doc.print',
  'doc.print.high',
];
const ANNOTATE = ['doc.annotate.modify'];
const FILL = ['doc.forms.fill'];

/**
 * What each document's examples change, on top of reading. A signature makes a version of the
 * reader's own layer only, deleted with it, so the signing examples sign for real.
 */
const CHANGES = {
  // The getting-started document: annotations, forms, pages, redaction, attachments, outline,
  // metadata.
  welcome: [
    ...ANNOTATE,
    ...FILL,
    'doc.forms.modify',
    'doc.attachments.modify',
    'doc.metadata.modify',
    'doc.outline.modify',
    'doc.pages.modify',
    'doc.pages.assemble',
    'doc.redact',
  ],
  // Signatures: filling the agreement, signing it, drawing a signature (a stamp) in its field,
  // and the edits that keep or break Lanternfield's signature (a comment, a new form field).
  agreement: [...ANNOTATE, ...FILL, 'doc.forms.modify', 'doc.sign'],
  // Stamps.
  approvals: ANNOTATE,
  // Drawing and marking up text; documents in panes and tabs.
  article: ANNOTATE,
  // Filling, checking and restyling the fields; reading and restoring the form's data.
  forms: [...FILL, 'doc.forms.modify', 'doc.forms.import'],
  // The form's calculation and format scripts.
  invoice: [...FILL, 'doc.forms.script'],
  // Moving, resizing, ordering and styling annotations.
  layout: ANNOTATE,
  // Links and their actions, JavaScript included.
  links: [...ANNOTATE, 'doc.forms.script'],
  // Rich text boxes.
  notice: ANNOTATE,
  // Comments and review.
  proposal: ANNOTATE,
  // Designing a form: adding and setting up fields.
  registration: [...FILL, 'doc.forms.modify'],
  // Creating, exporting and importing annotations.
  report: [...ANNOTATE, 'doc.annotate.import'],
  // Drawing tools and measurements.
  sketch: ANNOTATE,
};

/**
 * Every link's settings: a copy per visit, deleted after an hour unseen, from any origin, and the
 * example's name on what the reader adds (optional, so nobody is asked).
 */
const linkSettings = (name) => ({
  layerMode: 'per-visitor',
  keepVisitorLayers: false,
  visitorIdleSeconds: 60 * 60,
  visitorIdentity: { fields: { displayName: 'optional' }, ask: 'before-first-change' },
  scope: [...READ, ...CHANGES[name]],
});

const dryRun = process.argv.includes('--dry-run');
const baseUrl = process.env.CLOUDPDF_BASE_URL ?? 'https://engine.cloudpdf.com';
const token = process.env.CLOUDPDF_API_TOKEN;
const tenantId = process.env.CLOUDPDF_TENANT_ID;
if (!dryRun && (!token || !tenantId)) {
  throw new Error('Set CLOUDPDF_API_TOKEN and CLOUDPDF_TENANT_ID (or pass --dry-run)');
}

const documents = (await readdir(here, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && existsSync(join(here, entry.name, 'bake.mjs')))
  .map((entry) => entry.name)
  .sort();
const unscoped = documents.filter((name) => !CHANGES[name]);
if (unscoped.length > 0) {
  throw new Error(`Say what the examples of ${unscoped.join(', ')} change, in CHANGES`);
}
const links = existsSync(record) ? JSON.parse(await readFile(record, 'utf8')) : {};
const client = dryRun ? null : new CloudPDFClient({ baseUrl, token });

const changed = [];
for (const name of documents) {
  const bytes = new Uint8Array(await readFile(join(pdfs, `${name}.pdf`)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const settings = linkSettings(name);
  const known = links[name];
  if (known) {
    if (known.sha256 !== sha256) changed.push(name);
    if (dryRun) {
      console.log(`${name}: would set link ${known.shareToken} to its settings`);
      continue;
    }
    await client.shares.update({ tenantId, shareId: known.shareToken, ...settings, origins: null });
    console.log(`${name}: link ${known.shareToken} set`);
    continue;
  }
  if (dryRun) {
    console.log(`${name}: would upload ${bytes.length} bytes and create a link per visit`);
    continue;
  }
  const { document } = await client.uploads.create({
    tenantId,
    source: bytes,
    metadata: { name: `${name}.pdf` },
  });
  const { share } = await client.shares.create({ tenantId, docId: document.id, ...settings });
  links[name] = { docId: document.id, shareToken: share.id, sha256 };
  // Written after every document: a failure halfway keeps what's already on CloudPDF.
  await writeFile(record, `${JSON.stringify(links, null, 2)}\n`);
  console.log(`${name}: ${document.id}, link ${share.id}`);
}

for (const name of changed) {
  console.log(
    `${name}: the PDF changed since it went to CloudPDF; its link still opens the old one`,
  );
}
