#!/usr/bin/env node
// Deterministic generator for the Phase 0 action-payload fixtures. No
// dependencies, byte-stable output (no dates, no randomness) so the committed
// PDFs are reproducible and reviewable.
//
// Regenerate with:
//   node packages/engine/main/test/fixtures/generate-action-fixtures.mjs
//
// Emits:
//   action_payloads.pdf   — one page of link annotations carrying every
//                           executable payload shape: GoTo /FitR, URI+/IsMap,
//                           Named, Hide (array with a name + an indirect
//                           annotation ref, /H false; scalar /T; a partial
//                           list poisoned by a direct inline dict), the
//                           ResetForm three states, Launch, GoToR, one
//                           JavaScript→GoTo→Hide /Next chain, and one
//                           malformed GoTo (no /D) for payload-dropped.
//   open_action_dest.pdf  — a destination-form catalog /OpenAction.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Assemble numbered objects into a classic-xref PDF. */
function buildPdf(objects) {
  let body = '%PDF-1.7\n%âãÏÓ\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(latin1Bytes(body));

  function byteLength(text) {
    return latin1Bytes(text).length;
  }
  function latin1Bytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
  }
}

function linkAnnot(nm, rect, action) {
  return `<< /Type /Annot /Subtype /Link /Rect [${rect}] /NM (${nm}) /F 4 /A ${action} >>`;
}

// ── action_payloads.pdf ────────────────────────────────────────────────────
{
  const PAGE = '3 0 R';
  const SQUARE = '4 0 R'; // the hide-by-reference target
  const links = [
    linkAnnot('goto-fitr', '10 700 60 720', `<< /S /GoTo /D [${PAGE} /FitR 10 20 300 400] >>`),
    linkAnnot('uri-map', '10 670 60 690', '<< /S /URI /URI (https://example.test/map) /IsMap true >>'),
    linkAnnot('named-next', '10 640 60 660', '<< /S /Named /N /NextPage >>'),
    linkAnnot('hide-mixed', '10 610 60 630', `<< /S /Hide /T [(note1) ${SQUARE}] /H false >>`),
    linkAnnot('hide-scalar', '10 580 60 600', '<< /S /Hide /T (fieldB) >>'),
    linkAnnot('reset-include', '10 550 60 570', '<< /S /ResetForm /Fields [(calc1)] /Flags 1 >>'),
    linkAnnot('reset-absent', '10 520 60 540', '<< /S /ResetForm /Flags 1 >>'),
    linkAnnot('reset-empty', '10 490 60 510', '<< /S /ResetForm /Fields [] >>'),
    linkAnnot('launch-app', '10 460 60 480', '<< /S /Launch /F (app.exe) >>'),
    linkAnnot('gotor-file', '10 430 60 450', '<< /S /GoToR /F (other.pdf) /D [0 /Fit] >>'),
    linkAnnot(
      'chain-js-goto-hide',
      '10 400 60 420',
      `<< /S /JavaScript /JS (app.alert\\('chain'\\);) ` +
        `/Next << /S /GoTo /D [${PAGE} /XYZ 5 10 1.25] /Next << /S /Hide /T (note1) >> >> >>`,
    ),
    linkAnnot('goto-malformed', '10 370 60 390', '<< /S /GoTo >>'),
    linkAnnot('hide-partial', '10 340 60 360', '<< /S /Hide /T [(kept) << /Foo 1 >>] >>'),
  ];
  const annotRefs = ['4 0 R'];
  for (let i = 0; i < links.length; i++) annotRefs.push(`${5 + i} 0 R`);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [${annotRefs.join(' ')}] >>`,
    '<< /Type /Annot /Subtype /Square /Rect [400 700 450 750] /NM (note1) /F 4 >>',
    ...links,
  ];
  writeFileSync(resolve(here, 'action_payloads.pdf'), buildPdf(objects));
}

// ── open_action_dest.pdf ───────────────────────────────────────────────────
{
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /XYZ 10 700 1.5] >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  writeFileSync(resolve(here, 'open_action_dest.pdf'), buildPdf(objects));
}

console.log('wrote action_payloads.pdf + open_action_dest.pdf');
