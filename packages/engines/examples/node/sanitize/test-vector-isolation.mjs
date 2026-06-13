// Each vector flag must remove only its own vector and leave the others intact —
// proving the EPDF_* exports are independently effective and correctly scoped.
import { makeEngine, openDirty } from './engine-setup.mjs';
import { loadDoc, catalogHas, namesSubtree, anyPageHasThumb, assert } from './assert-helpers.mjs';

const engine = await makeEngine();

// XMP only.
{
  const doc = await openDirty(engine, 'xmp');
  const out = await engine
    .sanitizeDocument(doc, { xmp: true, javascript: false, embeddedThumbnails: false, attachments: false })
    .toPromise();
  const p = await loadDoc(out);
  assert(!catalogHas(p, 'Metadata'), 'xmp-only: XMP /Metadata removed');
  assert(catalogHas(p, 'OpenAction'), 'xmp-only: JS /OpenAction preserved');
  assert(anyPageHasThumb(p), 'xmp-only: /Thumb preserved');
  await engine.closeDocument(doc).toPromise();
}

// JavaScript only.
{
  const doc = await openDirty(engine, 'js');
  const out = await engine
    .sanitizeDocument(doc, { xmp: false, javascript: true, embeddedThumbnails: false, attachments: false })
    .toPromise();
  const p = await loadDoc(out);
  assert(!catalogHas(p, 'OpenAction'), 'js-only: /OpenAction removed');
  assert(!catalogHas(p, 'AA'), 'js-only: /AA removed');
  assert(namesSubtree(p, 'JavaScript') === undefined, 'js-only: /Names /JavaScript removed');
  assert(catalogHas(p, 'Metadata'), 'js-only: XMP preserved');
  assert(anyPageHasThumb(p), 'js-only: /Thumb preserved');
  await engine.closeDocument(doc).toPromise();
}

// Embedded thumbnails only.
{
  const doc = await openDirty(engine, 'thumb');
  const out = await engine
    .sanitizeDocument(doc, { xmp: false, javascript: false, embeddedThumbnails: true, attachments: false })
    .toPromise();
  const p = await loadDoc(out);
  assert(!anyPageHasThumb(p), 'thumb-only: /Thumb removed');
  assert(catalogHas(p, 'Metadata'), 'thumb-only: XMP preserved');
  assert(catalogHas(p, 'OpenAction'), 'thumb-only: /OpenAction preserved');
  await engine.closeDocument(doc).toPromise();
}

console.log('PASS test-vector-isolation: each vector removed independently, others preserved');
process.exit(0);
