// Builds a deterministic "dirty" PDF carrying every non-content hidden vector the
// sanitize primitive must reach: Info metadata, an XMP /Metadata stream, document
// JavaScript (/OpenAction + /Names /JavaScript), a page /Thumb, and an attachment.
//
// Run: node build-dirty-fixture.mjs   ->  writes dirty.pdf next to this file.
//
// pdf-lib notes: context.obj() turns string VALUES into PDFString, so every
// name-valued entry (/S, /Type, ...) is wrapped in PDFName.of(). doc.attach()
// creates the catalog /Names tree, so JavaScript is merged into the existing
// Names dict AFTER attaching rather than overwriting it.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFRawStream, PDFString } from 'pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([200, 200]);
page.drawText('Secret 123-45-6789', { x: 20, y: 100, size: 12 });

// (a) Info-dictionary metadata
doc.setAuthor('Jane Privileged');
doc.setTitle('PRIVILEGED - draft settlement');
doc.setProducer('MagnaCartaFixture');

// (b) XMP /Metadata stream on the catalog
const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:creator><rdf:Seq><rdf:li>Jane Privileged</rdf:li></rdf:Seq></dc:creator>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">PRIVILEGED - draft settlement</rdf:li></rdf:Alt></dc:title>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
const xmpBytes = new TextEncoder().encode(xmp);
const xmpStream = PDFRawStream.of(
  doc.context.obj({ Type: PDFName.of('Metadata'), Subtype: PDFName.of('XML'), Length: xmpBytes.length }),
  xmpBytes,
);
doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmpStream));

// (c) Document JavaScript: /OpenAction (a JS action) + /Names /JavaScript name tree
const jsCode = 'app.alert("phone home");';
const jsAction = doc.context.obj({
  Type: PDFName.of('Action'),
  S: PDFName.of('JavaScript'),
  JS: PDFString.of(jsCode),
});
const jsActionRef = doc.context.register(jsAction);
doc.catalog.set(PDFName.of('OpenAction'), jsActionRef);

// (d) Page /Thumb (presence is the test; pixel content is irrelevant)
const thumbBytes = new Uint8Array([0x00, 0x7f, 0xff, 0x80]);
const thumb = PDFRawStream.of(
  doc.context.obj({
    Type: PDFName.of('XObject'), Subtype: PDFName.of('Image'),
    Width: 2, Height: 2, ColorSpace: PDFName.of('DeviceGray'),
    BitsPerComponent: 8, Length: thumbBytes.length,
  }),
  thumbBytes,
);
page.node.set(PDFName.of('Thumb'), doc.context.register(thumb));

// (e) Attachment (creates catalog /Names /EmbeddedFiles)
await doc.attach(new Uint8Array([1, 2, 3, 4]), 'evidence.bin', {
  mimeType: 'application/octet-stream',
  description: 'embedded file',
});

// (c continued) build our own /Names dict carrying /JavaScript. doc.attach() defers
// creating the /Names tree until save(), where it merges /EmbeddedFiles INTO this
// same dict (pdf-lib's embedAll uses lookupMaybe), so both subtrees coexist.
const jsNameTree = doc.context.obj({ Names: [PDFString.of('MagnaCartaJS'), jsActionRef] });
const namesDict = doc.context.obj({ JavaScript: doc.context.register(jsNameTree) });
doc.catalog.set(PDFName.of('Names'), doc.context.register(namesDict));

const bytes = await doc.save({ useObjectStreams: false });
const out = fileURLToPath(new URL('./dirty.pdf', import.meta.url));
writeFileSync(out, bytes);
console.log('wrote', out, bytes.length, 'bytes');
