// Builds a PDF with a hidden optional-content (OCG) layer for the OCG-removal
// spike/follow-up. The page has VISIBLE text plus a marked-content section
// (/OC /MC0 BDC ... EMC) governed by an OCG whose default config is OFF, so the
// "HIDDEN-LAYER-SECRET" text is hidden by default yet physically present.
//
// The content stream is an unfiltered PDFRawStream, so the BDC/OC operators and
// the hidden text are visible to a raw byte scan (no inflate needed to verify).
//
// Run: node build-ocg-fixture.mjs  ->  writes ocg-dirty.pdf next to this file.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFString, PDFRawStream } from 'pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);

// Standard Type1 font (no embedding needed) referenced as /F1.
const fontRef = doc.context.register(
  doc.context.obj({ Type: PDFName.of('Font'), Subtype: PDFName.of('Type1'), BaseFont: PDFName.of('Helvetica') }),
);

// The OCG and the catalog /OCProperties with the layer defaulted OFF (hidden).
const ocgRef = doc.context.register(
  doc.context.obj({ Type: PDFName.of('OCG'), Name: PDFString.of('HiddenLayer') }),
);
const ocPropsRef = doc.context.register(
  doc.context.obj({
    OCGs: [ocgRef],
    D: doc.context.obj({ OFF: [ocgRef], ON: [], Order: [ocgRef] }),
  }),
);
doc.catalog.set(PDFName.of('OCProperties'), ocPropsRef);

// Unfiltered content stream: a visible run, then a hidden OCG-marked run.
const content = `BT /F1 18 Tf 50 700 Td (VISIBLE) Tj ET
/OC /MC0 BDC
BT /F1 18 Tf 50 650 Td (HIDDEN-LAYER-SECRET) Tj ET
EMC
`;
const contentBytes = new TextEncoder().encode(content);
const contentRef = doc.context.register(
  PDFRawStream.of(doc.context.obj({ Length: contentBytes.length }), contentBytes),
);
page.node.set(PDFName.of('Contents'), contentRef);

// Resources: the font as /F1 and the OCG as the /MC0 marked-content property.
page.node.set(
  PDFName.of('Resources'),
  doc.context.register(
    doc.context.obj({
      Font: doc.context.obj({ F1: fontRef }),
      Properties: doc.context.obj({ MC0: ocgRef }),
    }),
  ),
);

const bytes = await doc.save({ useObjectStreams: false });
const out = fileURLToPath(new URL('./ocg-dirty.pdf', import.meta.url));
writeFileSync(out, bytes);
console.log('wrote', out, bytes.length, 'bytes');
