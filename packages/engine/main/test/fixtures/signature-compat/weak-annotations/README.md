# Weak annotation identity: signature findings

Recorded **2026-09-23** against EmbedPDF HEAD
`348ab8111a7f566b46092880da558271c3f0b067`, using the available WASM and native
runtime builds. This is an investigation archive, not a promoted signature
policy or an implementation of annotation identity transitions.

## Findings to retain

1. **The approval-signature direct-annotation control was VALID in Acrobat.**
   Signing a PDF containing direct annotations did not universally fail in this
   experiment.
2. **The tested edits to that approval/direct family were INVALID:** deletion,
   deletion plus survivor `/NM` names, names alone, and even a byte-identical
   page rewrite. This does not isolate naming as the cause. Skipping naming
   does not establish signature preservation: deletion without naming failed.
3. **The matched approval/indirect rewrite was VALID**, with subsequent changes.
   The writer and page-only rewrite were matched; annotation dictionaries were
   indirect before signing. This strongly implicates storage layout in this
   fixture family, without establishing Acrobat's general rules or validating
   conversion after signing.
4. **The explicit DocMDP P=3 direct baseline was already INVALID before any
   edit.** It has one revision and signed coverage ending at EOF. Its later
   rewrite also failed, but cannot show that the rewrite caused invalidation.
5. **The explicit P3 indirect rewrite was VALID**, with changes permitted by
   the certifier. Its unedited indirect baseline remains manually unobserved.
6. **Cryptographic checks passed independently.** Valid signed bytes, signer
   trust, overall Acrobat validity and modification classification are separate
   results. Our engines report valid/unchanged for some files Acrobat rejects;
   for the accepted indirect rewrites, our engines say unchanged while Acrobat
   acknowledges subsequent/permitted changes.

These observations do **not** prove “editing any direct annotation always
invalidates any signed PDF,” nor do they prove that a direct annotation cannot
be signed. They do not approve automatic `/NM` stamping on signed documents.
Exact reference transitions remain useful for concurrency, but cannot by
themselves make a PDF mutation signature-safe.

## Acrobat observations

Twelve distinct inputs were identified from the user's screenshots: four valid
and eight invalid. File-to-screenshot attribution is recorded explicitly;
filenames are not visible in the dialogs, and the first control was identified
from its position in the user's comparison. The raw record preserves that limit.

| Input                                                                                                                             | Overall result        | Modification result                            | Evidence                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [approval-inline-control](pdfs/approval-inline-control.pdf)                                                                       | VALID                 | Unchanged                                      | [Screenshot](acrobat-evidence/approval-inline-control.png)                                |
| [approval-inline-delete](pdfs/approval-inline-delete.pdf)                                                                         | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-delete.png)                                 |
| [approval-inline-delete-names](pdfs/approval-inline-delete-names.pdf)                                                             | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-delete-names.png)                           |
| [approval-inline-names](pdfs/approval-inline-names.pdf)                                                                           | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-names.png)                                  |
| [approval-inline-rewrite-unchanged](supplemental/approval-inline-rewrite-unchanged.pdf)                                           | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-rewrite-unchanged.png)                      |
| [approval-inline-rewrite-size-preserved](supplemental/approval-inline-rewrite-size-preserved.pdf)                                 | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-rewrite-size-preserved.png)                 |
| [corpus-v3-54](reference/54-identical-page-widget-control.pdf)                                                                    | VALID                 | Unchanged                                      | [Screenshot](acrobat-evidence/corpus-v3-54.png)                                           |
| [approval-inline-rewrite-reference-writer](supplemental/approval-inline-rewrite-reference-writer.pdf)                             | INVALID               | Altered/corrupted                              | [Screenshot](acrobat-evidence/approval-inline-rewrite-reference-writer.png)               |
| [approval-indirect-annotations-rewrite-reference-writer](supplemental/approval-indirect-annotations-rewrite-reference-writer.pdf) | VALID                 | Signed revision intact; subsequent changes     | [Screenshot](acrobat-evidence/approval-indirect-annotations-rewrite-reference-writer.png) |
| [p3-direct-control](p3-matched/p3-direct-control.pdf)                                                                             | INVALID certification | Unedited baseline; altered/corrupted message   | [Screenshot](acrobat-evidence/p3-direct-control.png)                                      |
| [p3-direct-rewrite](p3-matched/p3-direct-rewrite.pdf)                                                                             | INVALID certification | Same rejection as its already-invalid baseline | [Screenshot](acrobat-evidence/p3-direct-rewrite.png)                                      |
| [p3-indirect-rewrite](p3-matched/p3-indirect-rewrite.pdf)                                                                         | VALID certification   | Changes permitted by certifier                 | [Screenshot](acrobat-evidence/p3-indirect-rewrite.png)                                    |

[acrobat-observations.json](acrobat-observations.json) owns the exact displayed
wording, identification notes, PDF SHA-256, screenshot SHA-256 and observed date.
Paths there and in the [checklist](acrobat-checklist.csv) are relative to this
folder. A manifest's generation-time `acrobat: unobserved` is historical metadata;
it does not override a later hash-matched observation.

The P3 direct control is byte-identical to `pdfs/p3-inline-control.pdf`; its
observation therefore covers that original input too. Five of the original
72 PDF hashes are observed; 67 remain unobserved. Three of the ten matched P3
inputs are observed; seven remain unobserved. The observation set is incomplete.

The dialogs show a manually trusted test identity, a valid signer identity and
successful path validation. The running Acrobat build was not confirmed.
Installed application metadata reported **26.002.21931**, while the prior corpus
run recorded **26.2.21869.0**. Do not infer a version regression from this alone.
Signing and displayed validation time were 2026/09/13 15:00:00 +03'00'.

## How the experiment was constructed

- `pdfs/`: 72 probes: six protection profiles × two `/Annots` array layouts ×
  six operations. The four markup dictionaries are **direct in both array
  layouts**. An indirect array is not the same as indirect annotations.
- `supplemental/`: five rewrite/control inputs isolating trailer `/Size`, the
  accepted reference writer, and direct versus indirect annotation dictionaries.
- `p3-matched/`: ten explicit P3 inputs, pairing direct/indirect dictionaries
  under an inline `/Annots` array. Controls, rewrite, delete, delete plus names,
  and names only. See [the P3 notes](p3-matched/README.md).
- `reference/`: a byte-identical copy of existing corpus case 54, rechecked as
  VALID and unchanged. It is a reference control, not a new distinct experiment.

All inputs use synthetic material and the corpus's existing public test identity.
There are 88 stored PDF files, including that reference and the repeated P3
baseline. Each group's manifest records the input facts and hashes. Adding `/NM`
provides durable addressing but does not turn a direct dictionary into an
indirect PDF object. Rewrites and naming/deletion outputs were produced by an
independent fixture writer, not by the proposed production naming pass.

## Automated results recorded during the investigation

| Check                                   | Recorded result                  | Interpretation                                                     |
| --------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Existing 91-PDF corpus                  | 92 checks passed per runtime     | Earlier compatibility baseline still passes                        |
| Original 72-probe matrix, both runtimes | 108 passed, 40 failed, 148 total | Diagnostic policy expectations; unresolved failures retained       |
| Original probe CMS checks               | 72 passed                        | Signed-byte cryptography; not Acrobat acceptance                   |
| Protected live deletions                | Four passed, included in 148     | P2 and signed `/Lock /P=2` rejected; bytes unchanged               |
| Supplemental checks                     | 10 passed across both runtimes   | Current engine output; still disagrees with Acrobat where recorded |
| Matched P3 checks                       | 20 passed across both runtimes   | Explicit P3, integrity, identity and current modification behavior |

The 40 matrix failures concern **indirect `/Annots` arrays containing direct
annotations**, under approval, P3, FieldMDP or locked-markup profiles. Both
runtimes report forbidden/unexplained where the diagnostic asserted permitted.
The analyzer reports the separate array object as unexplained. Failures occur
with and without naming. All 48 paired naming/non-naming comparisons had the
same engine modification verdict; this is not an Acrobat compatibility result.

The [archive verification](archive-verification.json) rechecked all 88 signature
inputs and reproduced 138 passes / 40 failures through the portable diagnostics.

Recorded reports and logs are kept alongside their inputs. They are evidence of
the original engine run, not expected answers generated for CI. The portable
`diagnostics/*.probe.ts` preserve the experimental assertions and are only run
with their explicit configuration; ordinary `*.test.ts` discovery does not pick
them up. Do not change the 40 expectations just to obtain a green run or promote
current engine answers into `policy-expectations.json`.

## Permission terminology

Plain approval signatures in these fixtures have no explicit DocMDP transform.
The current engine's `APPROVAL_BASELINE = 'annotate'` records its approval-change
analysis baseline, supported by existing cases 88/90/91. Acrobat displayed
form filling, signing and commenting permission text for the approval controls.
That display does not mean an explicit `/P 3` was present.

A present DocMDP transform with an omitted `/P` is a different case: its specified
default is P=2 (ISO 32000-1, Table 254). The matched P3 files explicitly contain
`/P 3` and catalog `/Perms /DocMDP` linkage. The relevant code is
[`protection.ts`](../../../../../core/src/signature/protection.ts).
The observed failures cannot be dismissed as accidentally using P2.

## Remaining questions

- Why does the unedited explicit-P3 direct baseline fail Acrobat? Compare a
  second signing path before attributing the result to a universal restriction.
- Observe the existing `p3-matched/p3-indirect-control.pdf` to finish that baseline
  pair; the approval indirect control is also unobserved.
- Run the actual production mutator through the same comparisons.
- Separately cover direct annotations that already have `/NM`, indirect `/Annots`
  containers, mixed pages, and signature/field/annotation-lock interactions.
- Investigate the analyzer's array coverage and both kinds of Acrobat disagreement.

These questions need bounded follow-ups; the existing evidence is sufficient to
keep signed-document bulk naming unapproved while planning identity transitions.

## Reproduce

Run commands from the EmbedPDF repository root (`oss/embedpdf`). Input PDFs,
observations and historical reports are frozen. New reports must go outside the
corpus. No reproduction command below changes Acrobat trust or opens its UI.

Verify all input/screenshot/source hashes and the checklist with standard Python:

```sh
python3 packages/engine/main/test/fixtures/signature-compat/weak-annotations/verify-evidence.py
```

Also verify every stored PDF's signatures using the pinned Python dependencies
and OpenSSL. This verifies cryptography without evaluating certificate trust:

```sh
python3 -m venv /tmp/epdf-signature-evidence
/tmp/epdf-signature-evidence/bin/pip install -r packages/engine/main/test/fixtures/signature-compat/requirements.txt
/tmp/epdf-signature-evidence/bin/python packages/engine/main/test/fixtures/signature-compat/weak-annotations/verify-evidence.py --cms
```

With the engine packages and WASM/native runtime payloads built, rerun only the
matched P3 diagnostics:

```sh
EPDF_WEAK_ANNOTATION_REPORT_DIR=/tmp/epdf-weak-annotation-rerun \
  pnpm --filter @embedpdf/engine exec vitest run --config test/fixtures/signature-compat/weak-annotations/diagnostics/vitest.config.mts p3-matched.probe.ts
```

Remove the trailing filename to run all 178 experimental checks. The individual recorded runs
sum to 138 passed and 40 failed; the original matrix's 40
unresolved assertions are expected to keep that command nonzero until reviewed
engine changes address them. A passing diagnostic never substitutes for manual
Acrobat observations. Runtime binaries are the checkout's available builds;
Git HEAD alone does not identify their build provenance.

Original generators and test/config sources are preserved byte-for-byte in
[experiment-source](experiment-source/README.md), with historical workstation
paths and a hash manifest. The portable diagnostics only adjust imports and
input/report paths. Generating new inputs requires a fresh directory and new
hash-specific observations; do not overwrite the frozen inputs.

See [INVESTIGATION.md](INVESTIGATION.md) for the chronological reasoning, matched
controls and results that led to these conclusions. No runtime behavior, public
API, existing corpus expectations or production permissions are changed by this
archive. It is documentation/test evidence and requires no package release note.
