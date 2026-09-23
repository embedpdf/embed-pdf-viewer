# Explicit DocMDP P=3 comparison

All ten PDFs contain an explicit `/DocMDP` transform with `/P 3`, referenced by the catalog `/Perms /DocMDP`, using the existing public test identity. They contain no FieldMDP transform or signature-field Lock. Both layouts retain an inline `/Annots` array; only the markup dictionaries are stored directly or as indirect objects. The direct baseline exactly reproduces the original `pdfs/p3-inline-control.pdf` bytes. The annotation dictionaries and appearances match across layouts before certification.

| Operation                        | Direct annotation dictionaries       | Indirect annotation objects              | Current engine verdict (both runtimes) |
| -------------------------------- | ------------------------------------ | ---------------------------------------- | -------------------------------------- |
| Signed baseline                  | [Direct](p3-direct-control.pdf)      | [Indirect](p3-indirect-control.pdf)      | unchanged                              |
| Identical page rewrite           | [Direct](p3-direct-rewrite.pdf)      | [Indirect](p3-indirect-rewrite.pdf)      | unchanged                              |
| Delete weak-1                    | [Direct](p3-direct-delete.pdf)       | [Indirect](p3-indirect-delete.pdf)       | permitted                              |
| Delete weak-1 and name survivors | [Direct](p3-direct-delete-names.pdf) | [Indirect](p3-indirect-delete-names.pdf) | permitted                              |
| Name annotations only            | [Direct](p3-direct-names.pdf)        | [Indirect](p3-indirect-names.pdf)        | permitted                              |

Every edited file preserves its complete signed baseline prefix. Signatures passed independent OpenSSL CMS verification, all original field/widget and signature object bodies stay identical, and survivor keys change only by /NM where selected. The rewrite cases change no page-body bytes. Names are `probe-weak-0`, etc.; delete removes weak-1. No post-signature conversion between direct and indirect storage is performed. All edits use the same reference corpus incremental writer; indirect annotation naming additionally updates the affected annotation objects.

The 20 local checks pass in WASM and native: explicit certification and P=3, cryptography/integrity/trust, annotation-edit capability allowed, current modification verdicts, annotation ordering, and weak/stable identities. Runtime results agree. These checks do not establish Acrobat acceptance. The user observed p3-direct-control as INVALID certification despite a valid trusted signer. The direct identical rewrite was also observed as INVALID with the same wording. The indirect identical rewrite was then observed as VALID certification with permitted changes. The other seven P3 observations are pending. The direct control has exactly one revision and its signed ByteRange ends at EOF: there is no post-signature edit. Its observed rejection also applies to the byte-identical original pdfs/p3-inline-control.pdf.

Original planned Acrobat order (superseded after the direct baseline failed):

1. `p3-direct-control.pdf`: establish that the explicit P3 baseline is valid.
2. `p3-direct-rewrite.pdf`: compare with the failed approval direct rewrite.
3. `p3-indirect-rewrite.pdf`: compare with the accepted approval indirect rewrite. If it fails, also check `p3-indirect-control.pdf` before interpreting it.
4. `p3-direct-delete.pdf` and `p3-direct-delete-names.pdf`: compare the actual proposed structural edit with/without naming under explicit P3.

Capture Signature Properties, including overall validity, exact modification wording, and signer trust. Keep the original bytes unchanged; do not save modifications from Acrobat. The naming-only and indirect-deletion variants are available if the initial results need further isolation. Observe each file independently; a no-op result does not establish the deletion verdict.

Reproduce the local checks from the repository root:

```sh
EPDF_WEAK_ANNOTATION_REPORT_DIR=/tmp/epdf-weak-annotation-rerun \
  pnpm --filter @embedpdf/engine exec vitest run --config test/fixtures/signature-compat/weak-annotations/diagnostics/vitest.config.mts p3-matched.probe.ts
```

Hashes and explicit transform facts are in `manifest.json`. Current engine results are in `engine-report.json`; `test.log` records the run. Manual evidence will be kept in the parent `acrobat-observations.json` and `acrobat-checklist.csv`. These are archived experiments; production code, existing v1/v2/v3 fixtures and promoted policy expectations were not changed. New runs write outside this archive.

## Baseline failure: next manual check

The direct P3 baseline is already INVALID. The next useful file is `p3-indirect-control.pdf`, the matched unedited baseline. Defer the direct rewrite, deletion and naming comparisons: they cannot establish whether those operations cause invalidation when their starting certification already fails. If the indirect baseline is VALID, this supports direct annotation storage affecting certification acceptance even before an incremental edit in this fixture family. If it is INVALID too, investigate the certification fixture construction using an existing known-positive certified corpus control. Neither outcome alone establishes a universal DocMDP rule.

The user subsequently supplied `p3-direct-rewrite.pdf`: “Document certification is INVALID.” The trusted signer and alteration/corruption messages match the already-invalid direct baseline. This preserves the observation but does not attribute failure to the rewrite. Next remains `p3-indirect-control.pdf`.

## Positive indirect P3 rewrite

`p3-indirect-rewrite.pdf` is VALID in the user-provided Acrobat screenshot. Its exact modification message is: “The changes that have been made to this document since it was certified are permitted by the Certifying party and do not invalidate the signature.” Trust and signer identity pass. This is a permitted-changes verdict, not an unchanged verdict. Both engine runtimes return summary valid with modifications unchanged: overall validity agrees, modification classification differs. The corresponding unedited indirect baseline remains unobserved. The earlier baseline-failure branch does not mean certification construction always fails: this is a positive explicit P3 example. The direct baseline remains invalid before any rewrite, so no mutation-causality claim can be made for it. Next: unedited `p3-indirect-control.pdf` to complete the baseline pair.
