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
  const fieldRefs = ['4 0 R', '5 0 R', '6 0 R', '7 0 R', '8 0 R', '9 0 R', '10 0 R', '12 0 R'];
  const FONT = '11 0 R';
  const textField = (name, rect, value, defaultValue) =>
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${name}) /Rect [${rect}] /F 4 ` +
    `/P ${PAGE} /V (${value}) /DV (${defaultValue}) /DA (/Helv 0 Tf 0 g) >>`;
  const button = (name, rect, action) =>
    `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T (${name}) /Rect [${rect}] ` +
    `/F 4 /P ${PAGE} /A ${action} >>`;
  const appendLog = (letter) =>
    `(var f = this.getField\\('log'\\); f.value = f.value + '${letter}';)`;

  // Widget /AA trees (Phase 2): alpha carries the native tooltip pair
  // (/E shows the hidden `tip` field, /X re-hides it — works with zero
  // scripting AND zero fill authority); beta carries /Fo /Bl /D /U Hide
  // entries (beta has no /A, so /U actually runs — /A shadows /U per ISO).
  const ALPHA_AA =
    ' /AA << /E << /S /Hide /T [(tip)] /H false >> /X << /S /Hide /T [(tip)] >> >>';
  const BETA_AA =
    ' /AA << /Fo << /S /Hide /T [(alpha)] >> /Bl << /S /Hide /T [(alpha)] /H false >> ' +
    '/D << /S /Hide /T [(log)] >> /U << /S /Hide /T [(log)] /H false >> >>';
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fieldRefs.join(' ')}] ` +
      `/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${FONT} >> >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [${fieldRefs.join(' ')}] >>`,
    textField('alpha', '50 700 250 720', 'filled-a', 'default-a').replace(' >>', `${ALPHA_AA} >>`),
    textField('beta', '50 660 250 680', 'filled-b', 'default-b').replace(' >>', `${BETA_AA} >>`),
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
    // The tooltip target: HIDDEN (/F 6 = hidden|print) until alpha's /E shows it.
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (tip) /Rect [300 540 400 560] /F 6 ` +
      `/P ${PAGE} /V (tooltip) /DV (tooltip) /DA (/Helv 0 Tf 0 g) >>`,
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

// ── action_triggers.pdf ────────────────────────────────────────────────────
// Phase-2 trigger proofs, all NON-JS (Hide trees + session sink observable):
//   page 1 /AA: /O shows pageTip(7), /C hides it (PC-before-C order proof);
//   square 5 `trigger`: /E shows tip(6), /X hides it — the native tooltip;
//   square 8 carries /PO /PC /PV /PI over lifeTip(9) and pvTip(12);
//   link 10: /A URI plus /AA /E /X over linkTip(11) — the LINK-plane feed
//   (links are behavior-inert to annotation hover; only LinkLayer anchors
//   can deliver these).
{
  const hideRef = (ref, show) => `<< /S /Hide /T [${ref}] /H ${show ? 'false' : 'true'} >>`;
  const square = (num, rect, extra = '') =>
    `<< /Type /Annot /Subtype /Square /Rect [${rect}]${extra} >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      `/AA << /O ${hideRef('7 0 R', true)} /C ${hideRef('7 0 R', false)} >> ` +
      '/Annots [5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
    square(5, '50 700 150 750', ` /NM (trigger) /F 4 /AA << /E ${hideRef('6 0 R', true)} /X ${hideRef('6 0 R', false)} >>`),
    square(6, '170 700 270 750', ' /NM (tip) /F 6'),
    square(7, '50 640 150 690', ' /NM (pageTip) /F 6'),
    square(8, '50 580 150 630', ` /NM (lifecycle) /F 4 /AA << /PO ${hideRef('9 0 R', true)} /PC ${hideRef('9 0 R', false)} /PV ${hideRef('12 0 R', true)} /PI ${hideRef('12 0 R', false)} >>`),
    square(9, '170 580 270 630', ' /NM (lifeTip) /F 6'),
    `<< /Type /Annot /Subtype /Link /Rect [50 520 150 570] /NM (hoverlink) /F 4 ` +
      `/A << /S /URI /URI (https://example.test/hover) >> ` +
      `/AA << /E ${hideRef('11 0 R', true)} /X ${hideRef('11 0 R', false)} >> >>`,
    square(11, '170 520 270 570', ' /NM (linkTip) /F 6'),
    square(12, '170 460 270 510', ' /NM (pvTip) /F 6'),
  ];
  writeFileSync(resolve(here, 'action_triggers.pdf'), buildPdf(objects));
}

// ── action_open_chain.pdf ──────────────────────────────────────────────────
// An ACTION-form /OpenAction with a /Next chain (Named → Hide): proves the
// document-open sequence dispatches trees, JS-free.
{
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /Named /N /NextPage ' +
      '/Next << /S /Hide /T [4 0 R] /H false >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R] >>',
    '<< /Type /Annot /Subtype /Square /Rect [100 700 200 750] /NM (openTip) /F 6 >>',
  ];
  writeFileSync(resolve(here, 'action_open_chain.pdf'), buildPdf(objects));
}

// ── action_hover_colors.pdf ────────────────────────────────────────────────
// The Phase-3 GATE, synthetically (corpus 02's exact shape, our bytes): a
// widget whose /AA /E JavaScript recolors a named square via getAnnots and
// writes a status field; /X restores the original colors. Under full ISO
// these are DOCUMENT mutations — authorized sessions persist them (engine
// /AP regeneration), unauthorized sessions get refusals + diagnostics.
{
  const PAGE = '3 0 R';
  const FONT = '8 0 R';
  const hoverScript = (stroke, fill, status) =>
    '(function findAnnot\(doc, page, name\) {\n' +
    '  var annots = doc.getAnnots\({nPage: page}\);\n' +
    '  if \(!annots\) return null;\n' +
    '  for \(var i = 0; i < annots.length; i++\) {\n' +
    '    if \(annots[i].name == name\) return annots[i];\n' +
    '  }\n' +
    '  return null;\n' +
    '}\n' +
    "var a = findAnnot\(this, 0, 'hoverSquare'\);\n" +
    `if \(a\) { a.strokeColor = ${stroke}; a.fillColor = ${fill}; }\n` +
    "var f = this.getField\('eventStatus'\);\n" +
    `if \(f\) f.value = '${status}';)`;
  const enter = hoverScript("['RGB', 0.14, 0.43, 0.89]", "['RGB', 0.86, 0.93, 1]", 'enter');
  const exit = hoverScript("['RGB', 0, 0.8, 0.2]", "['RGB', 0.9, 1, 0.9]", 'exit');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R 6 0 R] ' +
      `/DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${FONT} >> >> >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [4 0 R 5 0 R 6 0 R 7 0 R] >>',
    '<< /Type /Annot /Subtype /Square /Rect [300 650 420 730] /NM (hoverSquare) /F 4 ' +
      '/C [0 0.8 0.2] /IC [0.9 1 0.9] /CA 1 /BS << /W 2 >> >>',
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (hoverTrigger) /Rect [50 650 250 700] /F 4 ` +
      `/P ${PAGE} /V (hover me) /DV (hover me) /DA (/Helv 0 Tf 0 g) ` +
      `/AA << /E << /S /JavaScript /JS ${enter} >> /X << /S /JavaScript /JS ${exit} >> >> >>`,
    `<< /Type /Annot /Subtype /Widget /FT /Tx /T (eventStatus) /Rect [50 600 250 630] /F 4 ` +
      `/P ${PAGE} /V () /DV () /DA (/Helv 0 Tf 0 g) >>`,
    '<< /Type /Annot /Subtype /Square /Rect [450 650 500 700] /NM (bystander) /F 4 /C [0 0 0] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  writeFileSync(resolve(here, 'action_hover_colors.pdf'), buildPdf(objects));
}

console.log(
  'wrote action_payloads.pdf + action_buttons_form.pdf + action_triggers.pdf + action_open_chain.pdf + action_hover_colors.pdf + open_action_dest.pdf',
);
