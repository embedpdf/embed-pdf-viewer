# Investigation log: weak annotation identity and signatures

Experiment recorded on 2026-09-23 and subsequently archived here. Production code, existing v1/v2/v3 fixture bytes and promoted policy expectations were not changed. Repository HEAD: `348ab8111a7f566b46092880da558271c3f0b067`. Tests use the available WASM/native runtime builds and the current TypeScript signature validator (policy 4).

## Existing evidence

The repository's `packages/engine/main/test/fixtures/signature-compat` corpus has 91 synthetic PDFs with recorded Acrobat observations. `packages/core/signature/test/compatibility-corpus.test.ts` passed all 92 tests in WASM and all 92 in native mode. Existing approval-signature cases 88/90/91 use indirect Square annotations. They do not establish Acrobat behavior for the direct-annotation naming experiment.

## New experiment

`generate.py` imports the existing synthetic generator and public test identity. It generates 72 independent probes in `pdfs/`:

- Six protection profiles: approval, DocMDP P3, DocMDP P2, FieldMDP including ValueOne, signed /Lock /P=2, and an approval signature with a Locked markup survivor.
- Two layouts: inline /Annots array and indirect /Annots array. The four markup dictionaries inside either array are direct and have no /NM at baseline.
- Six cases per combination: control, delete, delete plus naming, naming only, reorder, reorder plus naming.

The naming-only case isolates the effect; it is not a recommendation to name annotations during reads. Protected mutation variants deliberately bypass the product mutator using the independent fixture writer, so they can test the analyzer's refusal. Separate engine tests verify that normal writes are refused for P2 and /Lock /P=2.

Generation checks: all 72 signatures passed independent OpenSSL CMS verification; all signed prefixes stayed intact; survivor dictionaries changed only by /NM where selected; removed targets and ordering were checked; original field/widget object bodies were unchanged. The Locked survivor is not named.

`diagnostics/probe.probe.ts` validates all 72 PDFs through each runtime plus four live mutation refusal cases. Result: **108 passed, 40 failed, 148 total**. All 40 failures are desired-policy assertions for indirect /Annots arrays under approval, P3, FieldMDP, or Locked-markup profiles. They fail both with and without naming.

| Layout/profile                                  | Delete                | Delete + names        | Reorder               | Reorder + names       |
| ----------------------------------------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Inline: approval, P3, FieldMDP, Locked survivor | permitted             | permitted             | permitted             | permitted             |
| Indirect array: those same profiles             | forbidden/unexplained | forbidden/unexplained | forbidden/unexplained | forbidden/unexplained |
| Either layout: P2 or /Lock /P=2                 | forbidden             | forbidden             | forbidden             | forbidden             |

Every control is unchanged. Every fixture's integrity and cryptography checks passed. All four live engine refusal tests passed and the rejected writes left downloaded bytes identical to the original. WASM and native produced identical diagnostic reports for all 72 fixtures. All **48 paired naming/non-naming comparisons** retained the same modification verdict.

The indirect-array finding names object 22 at edge `6:Annots`: “no rule explains it.” Inspection of `packages/engine/core/src/signature/analysis/evaluate.ts:928` shows the annotation rule covers annotation dictionaries and changes directly on page dictionaries; it does not account for the separate /Annots array in these probes. This is an existing analyzer coverage gap exposed by the new fixtures, not evidence that naming itself made the verdict worse. Do not change expected policy to match this result just to pass the tests.

## Acrobat status

Twelve distinct input files have user-provided screenshots: four valid and eight invalid. The latest P3 indirect rewrite is VALID with changes permitted by the certifier; the unedited indirect baseline remains unobserved. The unedited explicit-P3 direct-annotation baseline and its subsequent identical page rewrite both show INVALID certification while trusting the signer. The rewrite screenshot does not establish that rewriting caused the failure. The baseline is already invalid. It has one revision and its signed ByteRange ends at EOF. It is byte-identical to the original `pdfs/p3-inline-control.pdf`, so that original matrix entry shares the observation. Five of the original 72 hashes are now observed; 67 remain unobserved. Three of the ten matched P3 inputs have observations; seven remain unobserved.

The next diagnostic is `p3-matched/p3-indirect-control.pdf`, not a rewrite of the invalid direct baseline. Exact wording and evidence are retained in `acrobat-observations.json`, `acrobat-evidence/`, and `acrobat-checklist.csv`. The trusted signer identity and CMS checks do not establish Acrobat certification acceptance. No certificate trust settings or existing fixture bytes were changed.

### First observed disagreement

Acrobat rejects `approval-inline-delete`, whereas both current engine runtimes classify it as permitted. This is deletion without survivor naming, so it does not isolate a problem caused by /NM. Independent CMS verification passed for the generated file. The exact reason Acrobat rejects its post-signature revision remains unresolved; naming and positional-transition fallback cannot yet be claimed to preserve Acrobat validity. `approval-inline-delete-names` was subsequently observed with the same INVALID status and alteration/corruption message. Both variants fail, so this comparison cannot establish whether naming alone is acceptable. `approval-inline-names` was then observed as INVALID with the same alteration/corruption message. Naming alone therefore fails this fixture. This does not establish whether Acrobat rejects /NM specifically or a more general incremental rewrite of this direct-annotation page. A supplemental unchanged-page rewrite control now isolates that question.

## What this establishes and what it does not

The initial engine-only results made lazy naming a plausible alternative to weak-edit leases, but the subsequent Acrobat observations do not validate its signature compatibility. Deletion, naming-only, and a byte-identical page rewrite all fail in the observed approval-inline family. Because even the no-op rewrite fails, these observations do not isolate /NM as the cause. The experiment tests independent serialized output and current signature behavior, not a new production mutator, reference transition log, server concurrency protocol, failure rollback, flattening/redaction/widget removal, or Acrobat compatibility.

Transition design still needs:

1. Full source reference identity: document/base epoch, layer, page, generation, index; destination stable ref or tombstone.
2. Coverage for refs issued before an ordinary update strengthened their annotation. Either retain the update's explicit promotion or map every previously addressable position during the structural transition, including now-strong annotations.
3. Durable atomic commit of PDF mutation and transitions; local-engine equivalent; worker restart/cross-replica recovery; bounded retention with explicit stale-reference failure after expiry.
4. Identity resolution before target authorization, and authorization against the resolved current record; protected/narrow-grant annotation stamping policy.
5. No position-based guessing in plugin pending writes or rekey handling.
6. Tombstones, batch/cascade operations, imports/replacements, duplicate names, naming failure rollback, and identity-safe event/snapshot reconciliation.

Leases/heartbeats/start-editing UI can potentially be deprecated after this works. Index epochs and durable layer-version fencing cannot simply be removed: they distinguish the old occupant of an index from its new occupant. A stable logical public ID could hide this internally but is a separate API migration.

## Reproduce

See [README.md](README.md#reproduce) for portable commands. The archived engine
reports and logs describe the original run, including its 40 unresolved diagnostic
failures. Original generators and check sources are in
[experiment-source](experiment-source/README.md). New runs write outside this
folder and do not replace observations or frozen reports.

## Supplemental unchanged-page rewrite control

`supplemental/approval-inline-rewrite-unchanged.pdf` uses the same approved baseline and the same incremental writer, rewriting only the page object with byte-identical body content. It adds no /NM, removes nothing, and changes no ordering. The signed prefix and widget/field bytes remain unchanged; independent CMS verification passed. Its PDF hash and facts are in `supplemental/manifest.json`. The user subsequently observed this diagnostic input as INVALID in Acrobat despite a valid trusted signer. It does not replace any original fixture.

## Rewrite diagnosis: trailer Size control

The failed unchanged-page rewrite preserves page-object bytes, but the incremental writer changes trailer `/Size` from 24 to 25 despite allocating no new object. This is a variable to isolate, not an established cause (older corpus probes test oversized Size values too). `supplemental/approval-inline-rewrite-size-preserved.pdf` differs from the failed control by exactly one unsigned byte: `/Size 25` becomes `/Size 24`. Offsets, object bodies, signed prefix, and every other byte are identical. Parsing and independent CMS verification pass. The user observed the Size-preserved variant as INVALID with the same trusted-signer and alteration/corruption messages. The Size difference is therefore ruled out as the sole cause.

## Existing accepted reference recheck

`reference/54-identical-page-widget-control.pdf` is a byte-identical copy of the repository fixture (hash verified), historically observed VALID and unchanged on 2026-09-14. It rewrites a page and signature widget without changing their object bodies. It has no direct weak markup annotations. The user rechecked it on 2026-09-23 and observed VALID and unchanged. The earlier positive rewrite example therefore still works in the current environment; this does not prove that direct annotations alone cause our failures. Installed Acrobat metadata now reports 26.002.21931, whereas the previous observed build was 26.2.21869.0. This is contextual evidence, not an explanation of the mismatch; the running process build has not been independently confirmed.

## Matched rewrite using the accepted reference writer

The valid current recheck of case 54 leaves differences in both document content and revision serialization. `supplemental/approval-inline-rewrite-reference-writer.pdf` keeps the exact signed weak-annotation baseline and the identical page-object rewrite, but uses the corpus v3 `append_revision` writer used by case 54. A byte comparison against the failed Size-preserved rewrite confirms exactly two unsigned serialization changes: omission of the free object-zero xref entry, and literal-string instead of hex-string encoding of the same document ID bytes. Object offsets, startxref, Size, page bytes, original signed prefix, and field/widget object bytes remain unchanged. Independent OpenSSL CMS verification and both engine-runtime checks passed (2 tests; unchanged, valid integrity and cryptography). The user observed this variant as INVALID in Acrobat on 2026-09-23. Removing both writer differences does not repair this fixture; their presence is not required for this failure. This still does not establish direct annotations as the cause. Case 54 also rewrites the signature widget, so it is not itself a matched layout-only comparison.

## Matched indirect-annotation control

After the reference-writer direct-annotation rewrite also failed in Acrobat, `generate-indirect-annotation-control.py` reproduced the existing signed direct baseline byte for byte, then created a corresponding baseline whose four Square dictionaries are indirect objects before signing. This is different from the original `indirect-array` probes: here the /Annots array remains inline, while the annotation dictionaries themselves become indirect. No /NM is added. Annotation dictionary serialization and appearance object numbers/data are identical across layouts; other page entries and the four original widget references are identical. Allocating four annotation objects changes signature object numbers and signed bytes, so these are separately signed baselines, not a post-signature conversion experiment.

- `supplemental/approval-indirect-annotations-control.pdf`: the new signed baseline.
- `supplemental/approval-indirect-annotations-rewrite-reference-writer.pdf`: the identical page rewrite, using the same corpus `append_revision` function and page-only operation as the failed direct-annotation counterpart.

Both outputs preserve valid CMS signatures verified with OpenSSL. The rewrite preserves the full signed prefix and every page/field/widget body. Four engine checks passed (two inputs, WASM and native), all reporting valid integrity/cryptography and unchanged modifications. The user observed the rewritten indirect control as VALID on 2026-09-23, with this exact modification message: “The revision of the document that was covered by this signature has not been altered; however, there have been subsequent changes to the document.” The unmodified indirect baseline remains unobserved. The rewritten output passes overall validity in both Acrobat and our engines, but our engines report unchanged while Acrobat reports subsequent changes. This is a separate modification-classification mismatch. The matched contrast strongly implicates direct-versus-indirect annotation storage in this fixture family; it does not establish a universal Acrobat policy for every direct annotation, validate post-signature conversion, or approve /NM stamping on signed documents.

## Interim conclusion after nine manual observations (before the P3 follow-up)

| Input                                                                      | Acrobat overall validity | Acrobat modification message               |
| -------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| Original direct-annotation signed control                                  | VALID                    | Not modified                               |
| Direct annotations, page rewritten identically, reference writer           | INVALID                  | Altered or corrupted                       |
| Matched indirect annotations, page rewritten identically, reference writer | VALID                    | Signed revision intact; subsequent changes |
| Existing corpus case 54, page and widget rewritten identically             | VALID                    | Not modified                               |

The matched direct/indirect pair uses the same page-only rewrite and writer. The direct baseline is byte-identical to the originally accepted signed control. Making its markup dictionaries indirect before signing changes Acrobat's result for the later identical page rewrite. This is strong evidence of a direct-annotation compatibility problem in these synthetic inputs; exact validator internals and broader applicability remain unknown. No /NM is added in either member of this pair. The proposed automatic naming optimization cannot be considered signature-compatible for already-signed weak-annotation documents from this evidence. The independent server identity-transition design remains useful, but positional transitions alone do not make PDF edits signature-safe: the deletion without naming already failed Acrobat here. Direct annotation storage and missing /NM are distinct properties; these passing indirect annotations have object identities even without /NM.

Production planning should retain explicit identity transitions and stale-reference protection, and treat signature-preserving mutation of existing signed weak annotations as unresolved. Preserve these fixture hashes and observations as compatibility regression evidence; investigate the engine's INVALID-versus-unchanged disagreement on direct rewrites and its unchanged-versus-subsequent-changes difference on the indirect rewrite before changing policy. Do not generalize the outcome to unsigned documents or infer that pre-signing normalization repairs documents that are already signed. No further manual variant is needed to state this bounded finding; P3, FieldMDP, other layouts, production-mutator output, and post-signature conversion remain separate untested questions.

## Follow-up: explicit DocMDP P=3

The approval-signature baseline is recorded in `packages/engine/core/src/signature/protection.ts` as `APPROVAL_BASELINE = 'annotate'`, based on Acrobat cases 88/90/91. This differs from the specification default P=2 when an existing DocMDP transform omits P. The nine observations above concern approval signatures, not explicit certification. User authorized the separate P3 pass on 2026-09-23.

`p3-matched/` now contains ten explicit P3 certified PDFs: direct and indirect annotation dictionaries, each with baseline, identical rewrite, delete, delete plus names, and names-only variants. Both use inline Annots arrays. The direct baseline is byte-identical to the originally generated P3 control, and all appearance/annotation values match before certification. Catalog certification references, P=3 transforms, signed-prefix retention, operation contents, field/widget preservation, and OpenSSL CMS verification passed. All 20 targeted engine checks passed, including annotation-edit capabilities and explicit P3 recognition; runtime verdicts agree. This is fixture/current-engine validation only. The first P3 observation subsequently rejected the unedited direct baseline; the direct rewrite also failed, the indirect rewrite passed with permitted changes, and the other seven P3 observations remain pending. The signed baseline has one revision and covers the complete file, so pause the direct edit comparisons and check the indirect baseline next. See `p3-matched/README.md` for the manual order and `p3-matched/verification.json` for the compact local results.

## P3 baseline result

`p3-matched/p3-direct-control.pdf` was observed as “Document certification is INVALID.” with “The document has been altered or corrupted since the Certification was applied.” The signer's identity and certificate path validation are valid. Local inspection confirms explicit P=3, catalog certification linkage, one revision, and complete-file signed coverage; the original independent CMS and both engine checks passed. This disagreement exists before any naming, deletion or incremental rewrite. It therefore cannot support a claim that one of those later operations invalidated a previously valid P3 certification. The next check is the matched unedited indirect-annotation baseline.

## Current explicit-P3 comparison

| Input                                         | Acrobat certification | Modification wording           |
| --------------------------------------------- | --------------------- | ------------------------------ |
| Direct dictionaries: unedited signed baseline | INVALID               | Altered or corrupted           |
| Direct dictionaries: identical page rewrite   | INVALID               | Altered or corrupted           |
| Indirect objects: unedited signed baseline    | Unobserved            | Pending                        |
| Indirect objects: identical page rewrite      | VALID                 | Changes permitted by certifier |

The valid indirect result confirms this explicit P3 construction can be accepted by Acrobat; the direct baseline rejection remains a fixture compatibility issue before any mutation. This reinforces the storage-related difference observed under approval signatures, but does not validate automatic NM stamping on already-signed weak annotations, infer a universal prohibition, or demonstrate that a rewrite caused the direct P3 invalidity. The indirect P3 rewrite also exposes the same overall-valid-but-modification-classification mismatch as its approval counterpart: our engines say unchanged, Acrobat says permitted changes. The next useful screenshot is the unedited indirect P3 baseline; no new PDF generation or broad retesting is required.
