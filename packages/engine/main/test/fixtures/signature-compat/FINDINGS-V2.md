# Follow-up Acrobat results: appearances, restoration, and restrictions

Date: 2026-09-13. Corpus: `role-probes-v2`, cases 31–52. All 22 PDFs and all 25
signatures were independently checked and observed in Acrobat Reader. The batch
contains seven unchanged controls and fifteen changed-document probes. No
customer document data was used. The v1 bytes remain unchanged.

Raw results are in [observations.json](observations.json), run
`acrobat-reader-26.2.21869-macos-arm64-2026-09-13-v2-trusted`. The working-tree
engine snapshot is [engine-baseline-role-probes-v2.json](engine-baseline-role-probes-v2.json).
The same Acrobat build, macOS environment, and trusted test identity were used
as in v1. Trust and verification preferences were not changed.

Thirteen PDFs have all signatures accepted. Nine contain an invalid signature;
two of those have mixed results across their two signatures. These are
observations, not automatic engine policy expectations.

## Per-case results

"Unchanged" below is Acrobat's displayed wording. It does not assert that the
file has no appended revision. "Later changes" means Acrobat accepts the
signature and acknowledges subsequent changes. Properties-dialog results are
kept separate from change categories in the panel.

| Case | Probe                                                                  | Acrobat result                                             |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| 31   | No Square annotation                                                   | Valid, unchanged; no annotation-change category            |
| 32   | Square with explicit appearance                                        | Valid, unchanged; annotation-change category still present |
| 33   | Unchanged page-only Type3 font                                         | Valid, unchanged                                           |
| 34   | Change the page-only glyph                                             | Invalid                                                    |
| 35   | Unchanged font shared by page and form defaults                        | Valid, unchanged                                           |
| 36   | Change shared glyph without filling                                    | Invalid                                                    |
| 37   | Fill with a distinct changed font; preserve page font                  | Valid, later changes                                       |
| 38   | Unchanged font shared by page, field appearance, and defaults; value A | Valid, unchanged                                           |
| 39   | Change shared glyph and rewrite appearance; value stays A              | Valid, **reported unchanged despite visible page change**  |
| 40   | Unchanged P2 shared-font control                                       | Valid certification, unchanged                             |
| 41   | Shared-font page change plus filling under P2                          | Invalid certification                                      |
| 42   | Change page, restore, then sign again                                  | Both valid; both reported unchanged                        |
| 43   | Change page, then sign the changed state                               | First invalid; second valid and unchanged                  |
| 44   | Restore the original page after case 43                                | First valid and unchanged; second invalid                  |
| 45   | Restore same visual page with an added stream comment                  | Invalid                                                    |
| 46   | Restore page stream, retain changed shared glyph                       | Invalid                                                    |
| 47   | Identical page and sealed-widget rewrites together                     | Valid, reported unchanged                                  |
| 48   | Unchanged FieldMDP Include lock on ValueOne                            | Valid, unchanged                                           |
| 49   | Move that locked field                                                 | Valid, later changes                                       |
| 50   | Move an unlocked field under P2                                        | Invalid certification                                      |
| 51   | Hide that locked field                                                 | Invalid                                                    |
| 52   | Repeat original shared-font fill without Square annotation             | Valid, later changes despite visible page change           |

## What these results establish

**Font sharing alone is insufficient to explain acceptance.** The page-only
glyph edit fails (34), and registering that font in form defaults still fails
without an appearance update (36). Filling with a distinct font succeeds while
leaving the signed page unchanged (37). Cases 39 and 52, however, are accepted
when an appearance uses the changed font, even though the page also uses it.
In 39, the logical field value does not change and Acrobat even reports the
document as unchanged. These observations are consistent with appearance-resource
classification affecting the outcome; they do not establish Acrobat's internal
algorithm. Treat 39 and 52 as security-review cases. Do not automatically relax
the engine's protection of signed page content to reproduce them.

**Explicit certification changes the boundary.** The shared-font fill that is
accepted under an approval signature (52) is rejected under P2 (41). Moving a
field also fails under P2 (50). A role-based allowance must be conditional on the
effective policy. UI text in ordinary approval-signature properties also uses
the word "certifier"; the independently verified PDF transforms determine
whether a fixture actually contains certification.

**Restoration is judged separately for each signature in these examples.**
Signing a changed page does not recover the earlier signature (43). Restoring
the original page recovers the first signature while invalidating the signature
over the changed state (44). Restoring before adding the second signature leaves
both valid (42). An unconditional "once any intermediate edit is forbidden,
every later version stays invalid" rule would disagree with these cases.

**Visual equivalence is insufficient.** Case 45 restores the same visible page
but adds a harmless PDF comment to the decoded content stream; it is rejected.
Restoring the page stream while retaining a changed resource also fails (46).
These probes support investigating equality of relevant PDF state, rather than
comparing rendered images. They do not prove one universal byte-comparison rule.

**Field locks require property-specific investigation.** The Include lock on
ValueOne accepts its rectangle move (49), rejects hiding it (51), and rejected
filling it in v1 case 28. This is evidence against treating every field property
identically for Acrobat compatibility. Review the normative requirements and
the engine's intended guarantees before promoting an allowance.

**The combined identical rewrite is accepted.** Case 47 accepts page and sealed
widget rewrites together, strengthening the isolated v1 observations. The new
annotation-free control also makes clear that Acrobat can call an appended
revision unchanged.

## Presentation limits

The Square category persists in 32 even with an explicit appearance. The file
was closed without a save prompt and reopened, then validated through its native
Signature Properties dialog without interacting with the page. Its signature
remained valid and unchanged while the panel still listed the annotation. The
missing-appearance hypothesis alone therefore does not explain the category.
Removing the annotation removes the category (31). Its exact cause remains open.

Case 44 also lists a page-modified category below both signatures although their
properties results differ. Do not infer per-signature validity from the category
list alone. In 37, Acrobat displayed field value A during inspection while
Poppler rendered the stored field appearance as a dash; the page remained A in
both. Visible field presentation and stored appearance data are recorded
separately where they differ.

No standalone Acrobat screenshot files were saved. Messages were transcribed
from direct UI observations; the native properties dialogs provided complete
wording for the new restrictions. Cryptographic integrity was checked separately
with OpenSSL. The self-signed public test identity remains trusted in Acrobat at
the user's request; privileged content options remain disabled.

## Verification and maintenance

- All 25 v2 CMS signatures pass independent detached-content verification.
- `verify_v2.py` checks historical page states, actual changed glyph streams,
  shared versus distinct object references, field/widget agreement, certification
  and lock transforms, unchanged field values, and append-only control ancestry.
- Every PDF was rendered and visually reviewed before observation.
- The combined v1/v2 suite passes 53 tests on WASM and 53 on native `layerFile`
  bases. All 52 engine case reports match across runtimes.
- All 52 PDF hashes were rechecked after Acrobat testing. No PDF was saved from
  Acrobat. No production signature policy or promoted expectation was changed.

The engine's first-signature result differs from Acrobat in v2 cases 39, 42, 44,
47, 49, and 52. Case 44 still has an invalid second signature in both systems.
Cases 39 and 52 need an explicit security decision; the other differences need
narrow policy reviews and negative controls before becoming engine expectations.

For subsequent work, keep these input bytes frozen. The most useful extensions
are appearance-only changes under P2, reused resources crossing locked and
unlocked fields, and another font representation or Acrobat build. Those should
be separate versioned probes rather than edits to already observed fixtures.
