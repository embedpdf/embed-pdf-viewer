// Hidden optional-content (OCG) layer: its content must be physically removed
// (not merely hidden), and /OCProperties dropped, while visible content stays.
// Text extraction reads hidden-layer text too, so it is a faithful oracle:
// before the scrub it would include HIDDEN-LAYER-SECRET; after, only VISIBLE.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeEngine } from './engine-setup.mjs';
import { loadDoc, catalogHas, assert } from './assert-helpers.mjs';

const engine = await makeEngine();
const content = await readFile(fileURLToPath(new URL('./ocg-dirty.pdf', import.meta.url)));
const doc = await engine.openDocumentBuffer({ id: 'ocg', content }).toPromise();

const out = await engine
  .sanitizeDocument(doc, {
    xmp: false,
    javascript: false,
    embeddedThumbnails: false,
    attachments: false,
    optionalContentGroups: true,
  })
  .toPromise();

// /OCProperties removed (independent pdf-lib re-parse).
const parsed = await loadDoc(out);
assert(!catalogHas(parsed, 'OCProperties'), '/OCProperties removed');

// Hidden-layer content physically gone; visible content preserved.
const doc2 = await engine.openDocumentBuffer({ id: 'ocg-check', content: out }).toPromise();
const text = await engine.extractText(doc2, [0]).toPromise();
assert(!text.includes('HIDDEN-LAYER-SECRET'), `hidden OCG content removed (text=${JSON.stringify(text)})`);
assert(text.includes('VISIBLE'), `visible content preserved (text=${JSON.stringify(text)})`);

await engine.closeDocument(doc).toPromise();
await engine.closeDocument(doc2).toPromise();
console.log('PASS test-remove-ocg: hidden-layer content + /OCProperties removed, visible kept');
process.exit(0);
