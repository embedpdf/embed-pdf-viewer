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
//                           Plus a minimal AcroForm (text fields note1/calc1
//                           as merged widgets) so hide-by-NAME and the
//                           reset-include list resolve end-to-end in the
//                           dispatcher integration tests. Conformance keys
//                           on link /NM values and ignores the AcroForm.
//   action_buttons_form.pdf — a small AcroForm with HIDE / SHOW / RESET /
//                           CHAIN push buttons (mirroring the real-world 05
//                           form's shapes) for the plugin e2e: Hide+/H false,
//                           ResetForm include+exclude, and a
//                           JavaScript→ResetForm→JavaScript /Next chain.
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
  // A minimal AcroForm (merged field+widget dicts) so the hide-by-NAME
  // target (note1) and the reset-include list (calc1) resolve against real
  // fields. Appended AFTER the links so every pre-existing object number —
  // including the hide-by-reference square at 4 — stays byte-identical.
  const FIELD_NOTE1 = `${5 + links.length} 0 R`;
  const FIELD_CALC1 = `${6 + links.length} 0 R`;
  const FONT = `${7 + links.length} 0 R`;
  const annotRefs = ['4 0 R'];
  for (let i = 0; i < links.length; i++) annotRefs.push(`${5 + i} 0 R`);
  annotRefs.push(FIELD_NOTE1, FIELD_CALC1);

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${FIELD_NOTE1} ${FIELD_CALC1}] ` +
      `/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${FONT} >> >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [${annotRefs.join(' ')}] >>`,
    '<< /Type /Annot /Subtype /Square /Rect [400 700 450 750] /NM (note1) /F 4 >>',
    ...links,
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (note1) /Rect [400 640 500 660] /F 4 ` +
      `/P ${PAGE} /V (hello) /DV (start) /DA (/Helv 0 Tf 0 g) >>`,
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (calc1) /Rect [400 600 500 620] /F 4 ` +
      `/P ${PAGE} /V (42) /DV (0) /DA (/Helv 0 Tf 0 g) >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  writeFileSync(resolve(here, 'action_payloads.pdf'), buildPdf(objects));
}

// ── action_buttons_form.pdf ────────────────────────────────────────────────
// The plugin e2e form: three text fields with distinct /V vs /DV so a reset
// is observable, plus push buttons whose /A trees exercise the executor
// spine WITHOUT JavaScript (hide/show/reset — the actions-≠-JS proof) and
// one JS→ResetForm→JS chain (each script exactly once, in order).
{
  const PAGE = '3 0 R';
  const fieldRefs = ['4 0 R', '5 0 R', '6 0 R', '7 0 R', '8 0 R', '9 0 R', '10 0 R'];
  const FONT = '11 0 R';
  const textField = (name, rect, value, defaultValue) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /Rect [${rect}] /F 4 ` +
    `/P ${PAGE} /V (${value}) /DV (${defaultValue}) /DA (/Helv 0 Tf 0 g) >>`;
  const button = (name, rect, action) =>
    `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (${name}) /Rect [${rect}] ` +
    `/F 4 /P ${PAGE} /A ${action} >>`;
  const appendLog = (letter) =>
    `(var f = this.getField\\('log'\\); f.value = f.value + '${letter}';)`;

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fieldRefs.join(' ')}] ` +
      `/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${FONT} >> >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [${fieldRefs.join(' ')}] >>`,
    textField('alpha', '50 700 250 720', 'filled-a', 'default-a'),
    textField('beta', '50 660 250 680', 'filled-b', 'default-b'),
    textField('log', '50 620 250 640', '', ''),
    button('btn-hide', '300 700 400 720', '<< /S /Hide /T [(alpha)] >>'),
    button('btn-show', '300 660 400 680', '<< /S /Hide /T [(alpha)] /H false >>'),
    // Exclusion: resets the COMPLEMENT of [alpha, log] — i.e. beta only.
    button('btn-reset', '300 620 400 640', '<< /S /ResetForm /Fields [(alpha) (log)] /Flags 1 >>'),
    button(
      'btn-chain',
      '300 580 400 600',
      `<< /S /JavaScript /JS ${appendLog('A')} ` +
        `/Next << /S /ResetForm /Fields [(alpha)] ` +
        `/Next << /S /JavaScript /JS ${appendLog('B')} >> >> >>`,
    ),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  writeFileSync(resolve(here, 'action_buttons_form.pdf'), buildPdf(objects));
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

console.log('wrote action_payloads.pdf + action_buttons_form.pdf + open_action_dest.pdf');
