# Acrobat observations and next probes

The proposed follow-up batch is now complete. See [FINDINGS-V2.md](FINDINGS-V2.md)
for 22 additional PDFs and the distinctions they establish. This document
preserves the first run's observations and hypotheses.

Date: 2026-09-13. Corpus: `role-probes-v1`. All 30 PDFs, including all 36
signatures, were inspected in desktop Acrobat Reader with the public test signer
trusted. Twenty-five files had accepted signatures; five had invalid signatures.

The exact observations and input hashes are in [observations.json](observations.json),
run `acrobat-reader-26.2.21869-macos-arm64-2026-09-13-trusted`.
The working-tree engine comparison is in [engine-baseline-v3.json](engine-baseline-v3.json).
No production policy or promoted policy expectation was changed.

## Environment and evidence limits

- Acrobat Reader; user-reported build 26.2.21869.0. The installed application's
  bundle version independently reads 26.002.21869.
- macOS 26.6 (25G72), arm64, Apple M1 Max. Component versions supplied by the
  user are preserved in the observation run.
- The test certificate was manually trusted in Acrobat for signatures and
  certified documents. Dynamic content, privileged JavaScript, and privileged
  system operations were not enabled for this identity. It was not installed
  into the system keychain. At the user's request, it remains installed for
  follow-up testing.
- Verification used the time of signing. Revocation checking whenever possible
  remained enabled. This self-signed test-root run does not test revocation
  services, trusted timestamps, or real-world certificate-chain validation.
- Results were transcribed from Acrobat's UI. No standalone screenshot evidence
  files were saved. Clipped explanations are explicitly marked with an ellipsis.
  The general JavaScript preference was not recorded; case 12 tests validation
  classification, not execution of its action.
- PDFs were neither edited nor saved in Acrobat. All 30 hashes were rechecked
  against the frozen manifest after observation.

## Observed outcomes

Here, **valid with later changes** means Acrobat reports a valid signature while
explicitly acknowledging subsequent document changes. For unsigned final tails,
it also warns about unsigned changes after the last signature. It does not mean
the current document is unchanged or wholly covered by that signature.

| Cases  | Acrobat result                            | Relevant detail                                                                                  |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01, 22 | Valid, unchanged                          | Plain and AES-128 controls                                                                       |
| 02–07  | Valid with later changes                  | Identical rewrites accepted for all six tested roles, including page and sealed signature widget |
| 08     | Valid with later changes                  | Ordinary field fill and appearance                                                               |
| 09     | Valid with later changes                  | ReadOnly flag alone                                                                              |
| 10–11  | Valid with later changes                  | Moving and hiding the unlocked field; field-property categories shown                            |
| 12     | Valid with later changes                  | Added harmless validation action; action execution not tested                                    |
| 13     | Invalid                                   | Renaming reported as deleting the old field and adding the new field                             |
| 14     | Invalid                                   | Visible page-content change; one modified page reported                                          |
| 15     | Valid with later changes                  | A further revision restored the original page content                                            |
| 16     | Valid with later changes                  | Appearance font shared with form defaults                                                        |
| 17–20  | Both signatures valid                     | Second approval, tooltip, lock installation, and signature build-data probes                     |
| 21, 24 | Both signatures valid                     | Combined four-revision workflow, plain and AES-128                                               |
| 23     | Valid with later changes                  | Identical encryption-dictionary rewrite                                                          |
| 25     | Invalid certification                     | Filling under P1                                                                                 |
| 26     | Valid certified document                  | Filling under P2                                                                                 |
| 27     | Valid certified document                  | Annotation change under P3                                                                       |
| 28     | Invalid                                   | Filling a locked field                                                                           |
| 29     | Invalid                                   | Deliberate damage to signed bytes, despite trusted signer                                        |
| 30     | Valid with later changes; requires review | Shared-font edit visibly changes signed page content                                             |

The current engine reports forbidden modifications for 19 files that Acrobat
accepts: 02–07, 09–12, 15–16, 18–21, 23–24, and 30. These are candidates for
investigation, not 19 automatic permissions to add. The WASM and native
`layerFile` reports agree for every case.

Independent CMS verification succeeds for all signatures except the deliberate
tamper in 29. Consequently, Acrobat's invalid result for 13, 14, 25, and 28
must not be recorded as an observed digest mismatch merely from its badge.

## What changed our understanding

**Identical rewrites are accepted more broadly than the initial role hypothesis
suggested.** The isolated page and sealed-widget rewrites both remain valid in
this approval-signature corpus. Their appearance in a previously rejected
combined workflow does not establish either rewrite as its cause. This supports
fixing demonstrated false positives, with separate certification and lock tests
before generalizing the allowance.

**A restored page can regain acceptance.** Case 14 changes the displayed amount
from 1000 to 9000 and is invalid. Case 15 restores 1000 in a later revision and
is accepted. This challenges an unconditional rule that any forbidden
intermediate edit must permanently invalidate the final document. It is
consistent with comparing the signed state to the final state, but does not
prove Acrobat uses that algorithm for every object or signed intermediate
revision.

**The shared-font case is a substantive exception to investigate.** Case 30
changes a Type3 glyph used by a form appearance and signed page content. Acrobat
reports a valid signature. In Acrobat's View Signed Version, the page displays
an A; the final page displays a dash in the same position. This confirms the
visual difference in Acrobat itself. It may reflect how shared resources are
classified, but the mechanism is not established. Keep this case as a security
review probe; do not automatically make the engine accept it for compatibility.

The ordinary fills, later signatures, tested field properties, and encrypted
combined workflow support the proposed direction. They do not establish that
every field property or descendant of an allowed object is safe to change.

## A baseline anomaly to resolve first

The signature panel also displays an annotation-modified category for the
Square annotation in unchanged case 01, alongside its unchanged-document
message. The initial Square annotation has no explicit appearance stream.
Acrobat generating an appearance in memory is one possible explanation; it has
not been demonstrated. Relevant categories are transcribed in the raw records,
and this baseline category is documented separately in notes.

This does not negate the observed signature statuses. It limits conclusions
drawn from the annotation category alone, particularly for case 27.

## Proposed next batch

Build a new version with new identifiers and fresh hashes. Preserve v1 exactly.
Start with the following twelve probes, adding unchanged signed-base controls
where a probe introduces a new baseline. Each should isolate one hypothesis.

| Priority | Probe                                                                        | Question it resolves                                                        |
| -------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1        | Unchanged signed PDF with no Square annotation                               | Does the baseline annotation category disappear?                            |
| 1        | Unchanged signed PDF with an explicit Square appearance                      | Is a missing appearance responsible for the category?                       |
| 1        | Rewrite a font used only by page content                                     | Does the same glyph change fail without a form association?                 |
| 1        | Rewrite the page/form-shared font without filling the field                  | Is shared ownership alone enough for acceptance?                            |
| 1        | Fill using a cloned font, preserving the original page font                  | Positive control for a safe field-only resource update                      |
| 1        | Change the shared font and field appearance without changing the field value | Does an actual value change affect classification?                          |
| 1        | Repeat case 30 under P2 certification                                        | Does an explicit certification policy change this observed acceptance?      |
| 2        | Change, restore, then add a second approval                                  | Does sealing the restored state change the first signature's result?        |
| 2        | Change, sign that changed state, then restore                                | How are both signatures judged when an intermediate revision is signed?     |
| 2        | Restore the same visual page using different stream bytes                    | Is restoration judged by bytes, object values, or some broader equivalence? |
| 2        | Restore page content but retain a resource change                            | Does validation catch a remaining change beyond the page stream?            |
| 2        | Rewrite page and sealed widget identically together                          | Is the combined no-op accepted, as the isolated probes suggest?             |

If those probes establish the main distinctions, extend with shared resources
crossing locked and unlocked fields; property changes under P1/P2/P3 and field
locks; separate field/widget objects; and TrueType/CID fonts and object streams.
Re-run decisive cases on another Acrobat build before describing a result as a
stable compatibility rule.

## Using this evidence in the engine

Keep input facts, raw vendor observations, and reviewed engine expectations
separate. A policy expectation needs a rationale, including any deliberate
departure from Acrobat. Retain negative controls and preserve evidence for
intermediate revisions even if the final-state judgment becomes more nuanced.

The engine should own one policy shared by WASM and native file-backed use.
These probes establish classification behavior; they do not measure cloud
publication, storage, or server memory. Any proposed final-state comparison must
also be assessed against the engine's existing immutable-base and incremental
revision architecture before implementation.

The corpus can establish observable behavior and eliminate incorrect models of
Acrobat. It cannot reveal Acrobat's internal implementation. Enough consistent
observations can support a documented compatibility profile; evidence and
intentional safety differences should remain visible in that profile.
