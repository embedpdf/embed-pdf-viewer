# Signed pages with inline annotations (E1–E5)

Generated **2026-10-04** by [generate.py](generate.py) into [v1/](v1/). There are 20 synthetic PDFs,
all signed with the corpus's public test identity, `CN=EmbedPDF PUBLIC TEST KEY ONLY`
(`../keys/TEST-ONLY-signer.cer`, SHA-256 fingerprint
`0F:13:F8:FC:08:B2:C7:3B:91:42:FD:D9:FA:9B:FF:CC:7C:93:9E:13:4D:DE:6A:6B:B7:CE:4D:7D:91:B2:2D:74`). This
is the same certificate as the rest of the corpus, so a profile that already trusts it needs
nothing new.

## Results (observed 2026-10-04)

The full register, with screenshots, is [v1/acrobat-results.md](v1/acrobat-results.md) (also
[JSON](v1/acrobat-results.json) and [CSV](v1/acrobat-results.csv)). In total: 21 PDFs and 23
signatures, with every hash matching the manifest.

- **VALID:** S01, S12–S16, S19–S20, and the P3 object control
  (`weak-annotations/p3-matched/p3-indirect-control.pdf`).
- **INVALID:** S02–S06, S09–S11, S17–S18. The message on the approval cases is "altered or
  corrupted".
- **S07 and S08:** the original signature is INVALID; the second signature is VALID.

**What it shows:**
- When the signed revision holds an inline annotation anywhere, Acrobat rejects *every* later
  revision, including ones on page 2, a form fill, and an in-place edit of an object annotation.
  It is the whole document, not the page.
- Promoting the inline annotations before the first signature made every tested later change
  valid, under approval and under P=3.
- P=3 certification over inline annotations is invalid before any edit.

The resulting policy is D6b in `docs/plans/2026-10-04-optimistic-writes-forms-history.md` (platform
repository).

## Why

The Sep 23 weak-annotation investigation ([../weak-annotations](../weak-annotations/README.md))
found that, on an approval-signed page holding inline (direct) annotation dictionaries, every
tested change that rewrote the page was INVALID in Acrobat, even a byte-identical rewrite.

The plan in `docs/plans/2026-10-04-optimistic-writes-forms-history.md` (D6b) proposes a **frozen
page**:
- on a signed document, nothing may change the annotation list of a page that holds an inline
  annotation;
- object annotations on it may still be edited in place.

These probes test the parts of that rule nobody has observed yet.

## The documents

Every probe starts from one of four signed bases. Each base has two pages:

- **Page 1:**
  - three blue squares: `inline-0` and `inline-1` are inline dictionaries, `object-0` is an
    object;
  - text field `ValueOne`;
  - signed field `SignatureOne`;
  - empty signature field `SignatureTwo`.
- **Page 2:** objects only: the square `object-p2`, the text field `ValueTwo` and the empty
  signature field `SignatureThree`.

Revisions:
- Bases A and C: the unsigned document is revision 1, and the signature is revision 2.
- Bases B and D: revision 2 **promotes** page 1's inline squares to objects (same dictionaries,
  same positions). The signature is revision 3.
- Each probe below appends one more revision to its base. The exceptions are the controls (S01,
  S12, S17, S19), which are the bases themselves.

The generator asserts, for every probe:
- it is an incremental append to its base;
- it rewrites exactly the existing objects listed in `manifest.json` (`revisionWrites`);
- every signature digest matches;
- OpenSSL verifies every CMS.

## The probes

"Ours" is our expectation, not an observation.

| ID | File | Tests | Ours |
| :-- | :-- | :-- | :-- |
| S01 | `S01-approval-control.pdf` | Baseline: approval signature, mixed page 1 | VALID |
| S02 | `S02-approval-recolour-object-annotation-p1.pdf` | **E4:** recolour `object-0` in place (new appearance stream); page 1 is not rewritten | open |
| S03 | `S03-approval-retext-object-annotation-p1.pdf` | **E4:** change `object-0`'s comment text only | open |
| S04 | `S04-approval-retext-inline-annotation-p1.pdf` | Control: change `inline-0`'s text (rewrites page 1) | INVALID |
| S05 | `S05-approval-fill-field-p1.pdf` | **E1:** fill `ValueOne` on page 1 | open |
| S06 | `S06-approval-fill-field-p2.pdf` | **E1:** fill `ValueTwo` on page 2 | VALID |
| S07 | `S07-approval-sign-empty-field-p1.pdf` | **E2:** second signature in `SignatureTwo` on page 1. Record both signatures. | open |
| S08 | `S08-approval-sign-empty-field-p2.pdf` | **E2:** second signature in `SignatureThree` on page 2. Record both signatures. | VALID |
| S09 | `S09-approval-comment-p2.pdf` | **E3:** add a square on page 2 | open (VALID if Acrobat judges per page) |
| S10 | `S10-approval-comment-p1.pdf` | Control: add a square on page 1 | INVALID |
| S11 | `S11-approval-delete-object-annotation-p1.pdf` | Frozen list: delete the *object* `object-0` from page 1 | INVALID |
| S12 | `S12-promoted-control.pdf` | **E5** baseline: promoted, then signed | VALID |
| S13 | `S13-promoted-comment-p1.pdf` | **E5:** add a square on page 1 | VALID |
| S14 | `S14-promoted-recolour-annotation-p1.pdf` | **E5:** recolour the promoted `inline-0` | VALID |
| S15 | `S15-promoted-delete-annotation-p1.pdf` | **E5:** delete the promoted `inline-1` | VALID |
| S16 | `S16-promoted-reply-p1.pdf` | **E5:** reply (`/IRT`) to the promoted `inline-0` | VALID |
| S17 | `S17-p3-control.pdf` | Baseline: certification P=3, mixed page 1 | open (the Sep 23 P3 inline baseline was already INVALID) |
| S18 | `S18-p3-recolour-object-annotation-p1.pdf` | **E4** under P=3 | open |
| S19 | `S19-p3-promoted-control.pdf` | **E5** baseline under P=3 | VALID |
| S20 | `S20-p3-promoted-comment-p1.pdf` | **E5** under P=3: add a square on page 1 | VALID (permitted change) |

**One more file, already in the repository but never observed:**
`../weak-annotations/p3-matched/p3-indirect-control.pdf`. It is the unedited P3 baseline with
object annotations. Together with S17 and S19, it tells us whether P3 with any inline annotation
is invalid from the start.

## Recording

- Open each file as is. Don't fill, save, optimize or re-sign in Acrobat: that creates different
  bytes.
- Per signature, note the overall status (VALID / INVALID) and the modification message (for
  example "subsequent changes", "changes permitted by the certifier", "altered or corrupted").
- S07 and S08 have two signatures each.
- Either fill `v1/acrobat-results-template.json` (or its CSV), or send screenshots naming each file.
  Observations belong to the exact SHA-256 in `v1/manifest.json`.

## Regenerating

Never regenerate into `v1/`. It refuses a non-empty directory. To adapt a probe, generate into a new
directory with the pinned `../requirements.txt`:

```bash
python3 -m venv /tmp/sigvenv && /tmp/sigvenv/bin/pip install -r ../requirements.txt
/tmp/sigvenv/bin/python generate.py --out v2
```
