/**
 * Puts the docs' demo PDFs on CloudPDF, so cloudpdf.com's examples open the same documents as
 * embedpdf.com's. For each document `build.mjs` makes, it uploads
 * `website/public/pdfs/embedpdf-<folder>.pdf` and creates a share grant for it, then records both
 * in `cloud.json`, which `documents.mjs` reads. Run
 * `CLOUDPDF_API_TOKEN=… CLOUDPDF_TENANT_ID=… pnpm --filter @embedpdf/docs-content pdfs:cloud`;
 * `--dry-run` only says what it would do. `CLOUDPDF_BASE_URL` names another engine than
 * engine.cloudpdf.com.
 *
 * A document already in `cloud.json` is left alone. One whose PDF changed since is reported, not
 * replaced: a grant can't point at a new document yet, and a new grant means a new token in every
 * cloud copy.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CloudPDFClient } from '@cloudpdf/sdk';

const here = dirname(fileURLToPath(import.meta.url));
const pdfs = resolve(here, '../../../website/public/pdfs');
const record = join(here, 'cloud.json');

// What a docs reader may do: everything that reads. Nothing writes, so every reader can share one
// copy of each document.
const READ_SCOPE = [
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
const grants = existsSync(record) ? JSON.parse(await readFile(record, 'utf8')) : {};
const client = dryRun ? null : new CloudPDFClient({ baseUrl, token });

const changed = [];
for (const name of documents) {
  const bytes = new Uint8Array(await readFile(join(pdfs, `embedpdf-${name}.pdf`)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const known = grants[name];
  if (known) {
    if (known.sha256 !== sha256) changed.push(name);
    continue;
  }
  if (dryRun) {
    console.log(`${name}: would upload ${bytes.length} bytes and create a read grant`);
    continue;
  }
  const { document } = await client.uploads.create({
    tenantId,
    source: bytes,
    metadata: { name: `embedpdf-${name}.pdf` },
  });
  const { share } = await client.shares.create({ tenantId, docId: document.id, scope: READ_SCOPE });
  grants[name] = { docId: document.id, shareToken: share.id, sha256 };
  // Written after every document: a failure halfway keeps what's already on CloudPDF.
  await writeFile(record, `${JSON.stringify(grants, null, 2)}\n`);
  console.log(`${name}: ${document.id}, grant ${share.id}`);
}

for (const name of changed) {
  console.log(`${name}: the PDF changed since it went to CloudPDF; its grant still opens the old one`);
}
