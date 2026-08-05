// Full scrub: sanitizeDocument() with defaults must remove every hidden vector
// and emit a single-revision (non-incremental) document. Re-parses the output
// independently with pdf-lib (and the engine for attachments).
import { makeEngine, openDirty } from './engine-setup.mjs';
import { loadDoc, catalogHas, namesSubtree, anyPageHasThumb, assert } from './assert-helpers.mjs';

const engine = await makeEngine();
const doc = await openDirty(engine);

const out = await engine.sanitizeDocument(doc).toPromise(); // all vectors default true

// Catalog-level vectors, via an independent pdf-lib re-parse.
const parsed = await loadDoc(out);
assert(!catalogHas(parsed, 'Metadata'), 'XMP /Metadata removed');
assert(!catalogHas(parsed, 'OpenAction'), '/OpenAction removed');
assert(!catalogHas(parsed, 'AA'), 'catalog /AA removed');
assert(namesSubtree(parsed, 'JavaScript') === undefined, '/Names /JavaScript removed');
assert(!anyPageHasThumb(parsed), 'page /Thumb removed');

// Attachments, via the engine's own reader on the re-opened output.
const doc2 = await engine.openDocumentBuffer({ id: 'check', content: out }).toPromise();
const attachments = await engine.getAttachments(doc2).toPromise();
assert(attachments.length === 0, `attachments removed (got ${attachments.length})`);

// Non-incremental: a full rewrite has exactly one %%EOF (no retained prior revision).
const text = Buffer.from(out).toString('latin1');
const eofCount = (text.match(/%%EOF/g) || []).length;
assert(eofCount === 1, `single-revision output expected (one %%EOF), got ${eofCount}`);

await engine.closeDocument(doc).toPromise();
await engine.closeDocument(doc2).toPromise();
console.log('PASS test-sanitize-document: all vectors scrubbed, single-revision output');
process.exit(0);
