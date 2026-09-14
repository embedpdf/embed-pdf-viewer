# Acrobat observations: morning isolation, round 3

Observed 2026-09-14 in Adobe Acrobat Reader, user-reported build **26.2.21869.0**
(installed bundle **26.002.21869**), macOS 26.6 / arm64 / Apple M1 Max.
The corpus signer was trusted in every case. No trust settings were changed during this round.

## Results after explicit validation

| Probe | Supplied base change              | Signature Properties result   | Modification categories |
| ----- | --------------------------------- | ----------------------------- | ----------------------- |
| S1    | Dense xref, explicit free entries | INVALID; altered or corrupted | None displayed          |
| S2    | 16-byte first document ID         | INVALID; altered or corrupted | None displayed          |
| S3    | Info in base trailer              | INVALID; altered or corrupted | None displayed          |
| S4    | Header CR replaced with LF        | INVALID; altered or corrupted | None displayed          |
| S5    | Full qpdf rewrite                 | VALID; subsequent changes     | Five annotations        |
| S6    | S1 + S2 + S3 + S4                 | VALID; subsequent changes     | Five annotations        |

S1–S4 show these exact messages:

> Signature is INVALID.
>
> The document has been altered or corrupted since the Signature was applied.

S5 and S6 show:

> Signature is VALID, signed by EmbedPDF PUBLIC TEST KEY ONLY.
>
> The revision of the document that was covered by this signature has not been altered; however, there have been subsequent changes to the document.

Both successful files display **Annotations Modified**, containing:

- Square annot on page 1
- Circle annot on page 1
- PolyLine annot on page 1
- Polygon annot on page 1
- Ink annot on page 1

The initial S5/S6 panel said the document had not been modified. Clicking **Validate Signature**
produced the subsequent-changes wording above. The S6 banner then read:
“Signed and all signatures are valid, but with unsigned changes after the last signature.”
Use the explicitly validated properties result when comparing these cases.

## Common properties and method

All six report “The signer's identity is valid.” and
“Source of Trust obtained from manually imported trusted identity.” The trusted public test certificate
has SHA-256 `0f13f8fc08b2c73b9142fdd9fa9bffcc7c939e134dde6a6bb7ce4d7d91b22d74`.
All report successful path validation, validation at signing time, and no revocation checking for a
directly trusted certificate. The reason is “base bisection”. Signing times are
`2026/09/14 12:10:13 +03'00'` for S1–S4 and `2026/09/14 12:10:14 +03'00'` for S5/S6.

All six also display this exact permission message; it is a UI transcription, not an independent
classification of the signature's certification role:

> The certifier has specified that Form Fill-in, Signing and Commenting are allowed for this document. No other changes are permitted.

Each supplied PDF was opened, its expanded Signatures panel inspected, and its native Signature
Properties explicitly revalidated once. Screenshots were inspected interactively, without saving
standalone screenshots. An optional reopen pass was not completed after Acrobat disabled Open and
Close File; these are six completed observations, not repeat-run results. No PDF was saved or edited.

## Independent byte checks

All six PDF hashes match `MANIFEST.json` before and after inspection. Strict pyHanko parsing finds
three revisions and one signature covering the second revision. OpenSSL verifies each detached CMS
against its exact ByteRange bytes, without performing certificate-chain trust validation.

The final revision adds exactly one new, unreferenced object. Existing objects are not rewritten;
effective trailer values are unchanged except `/Size` and `/Prev`. The final EOF has a line ending
in every file. Thus the annotation categories above must not be treated as proof of actual
post-signature annotation edits.

Standalone `base-*.pdf` files mentioned in the README are absent. Instead, every original base prefix
was recovered in memory and matched to its manifest `base_sha256`. The stored bytes show:

| Probe | Header suffix after `%PDF-1.7` | Base ID lengths | Base trailer Info | Base xref subsections / entries |
| ----- | ------------------------------ | --------------- | ----------------- | ------------------------------- |
| S1    | `\r\n`                         | 4 / 16 bytes    | Absent            | 1 / 1237                        |
| S2    | `\r\n`                         | 16 / 16 bytes   | Absent            | 479 / 520                       |
| S3    | `\r\n`                         | 4 / 16 bytes    | `977 0 R`         | 479 / 520                       |
| S4    | `\n\n`                         | 4 / 16 bytes    | Absent            | 479 / 520                       |
| S5    | `\n`                           | 4 / 16 bytes    | Absent            | 1 / 519                         |
| S6    | `\n\n`                         | 16 / 16 bytes   | `977 0 R`         | 1 / 1237                        |

In particular, the supplied S4/S6 header mutation is **CRLF to LF LF**, not bare CR to LF.
S1/S6 contain 519 in-use and 718 free entries. S5 contains 518 in-use and one free entry;
it is a broader rewrite, not the same dense-table operation as S1.

## What this establishes

The supplied S6 combination succeeds, and S5 succeeds. None of the four isolated changes succeeds
in this batch. This supports an interaction among structural properties, but does **not** isolate
the minimum fix or establish that all four S6 changes are necessary. The successful S5 base still
has the short first ID and lacks trailer Info, so those properties are not universally disqualifying.

The next useful experiment is **S6 minus one fix at a time**, using new identifiers and preserving
the passing construction otherwise, with signed-only controls. Test smaller combinations after
those results. This round does not establish a general rule for every PDF, and it makes no policy
or engine implementation changes. Signed-only prefixes were not separately inspected in Acrobat.

Full per-file messages, hashes and verification details:
[ACROBAT-RESULTS-2026-09-14.json](./ACROBAT-RESULTS-2026-09-14.json).
Previous rounds, fixture bytes, manifest, engine code, policy proposal and sample ebook are unchanged.
