# Acrobat observations: morning isolation, round 4

Observed 2026-09-14 in Adobe Acrobat Reader, user-reported build **26.2.21869.0**
(installed bundle **26.002.21869**), macOS 26.6 / arm64 / Apple M1 Max.
The corpus signer was trusted in every case; no trust settings were changed in this round.

## Result

**Dense xref + base-trailer Info (T5) is the smallest successful combination tested for this ebook.**
T3 also passes. The six other probes fail, including both dense-xref/header variants.

| Probe | Changes to the base           | Explicitly validated result   | Modification categories |
| ----- | ----------------------------- | ----------------------------- | ----------------------- |
| T1    | Dense xref + LF LF header     | INVALID; altered or corrupted | None displayed          |
| T2    | ID + Info + LF LF header      | INVALID; altered or corrupted | None displayed          |
| T3    | Dense xref + ID + Info        | VALID; subsequent changes     | Five annotations        |
| T4    | Dense xref + ID               | INVALID; altered or corrupted | None displayed          |
| T5    | Dense xref + Info             | VALID; subsequent changes     | Five annotations        |
| T6    | ID + LF LF header             | INVALID; altered or corrupted | None displayed          |
| T7    | Info + LF LF header           | INVALID; altered or corrupted | None displayed          |
| T8    | Dense xref + single LF header | INVALID; altered or corrupted | None displayed          |

T5 and T1 were then closed, reopened and explicitly validated again. Both results repeated,
including every transcribed property message.

## Exact Acrobat messages

The six invalid cases show:

> Signature is INVALID.
>
> The document has been altered or corrupted since the Signature was applied.

T3 and T5 show:

> Signature is VALID, signed by EmbedPDF PUBLIC TEST KEY ONLY.
>
> The revision of the document that was covered by this signature has not been altered; however, there have been subsequent changes to the document.

Both successful files display **Annotations Modified**, with these rows:

- Square annot on page 1
- Circle annot on page 1
- PolyLine annot on page 1
- Polygon annot on page 1
- Ink annot on page 1

Their initial panels said the document had not been modified. Explicitly clicking **Validate
Signature** produced the subsequent-changes properties message above. The recorded result uses
that explicit validation, not the initial panel wording.

All eight report “The signer's identity is valid.”, trust obtained from a manually imported
identity, successful path validation, validation at signing time, and no revocation checking for
a directly trusted certificate. The reason is “base bisection 2”. Signing times on 2026/09/14
are `12:30:16 +03'00'` for T1, `12:30:17 +03'00'` for T2–T5, and `12:30:18 +03'00'` for T6–T8.
The field is `signature_1 on page 2`.

The public test certificate has SHA-256
`0f13f8fc08b2c73b9142fdd9fa9bffcc7c939e134dde6a6bb7ce4d7d91b22d74`.
All eight also display the following permission message. This is a literal UI transcription,
not an independent classification of certification role:

> The certifier has specified that Form Fill-in, Signing and Commenting are allowed for this document. No other changes are permitted.

## Independent checks

All eight complete-file hashes match `MANIFEST.json` before and after inspection. Strict pyHanko
parsing finds three revisions and one signature covering the second revision. OpenSSL verifies
each CMS against the exact signed ByteRange bytes, without certificate-chain trust validation.
Every file ends with a line ending after EOF.

The final revision adds exactly one new unreferenced object. It rewrites no existing object and
changes no effective trailer value except `/Size` and `/Prev`. The annotation-category rows must
therefore not be treated as evidence of five actual post-signature annotation edits.

All base object bytes before the original xref match round-3 S1, apart from the declared header
substitution. Every in-use base xref offset resolves to the expected object number and generation,
including the shifted offsets in T8. The stored base properties match the probe labels:

| Probe | Header suffix after `%PDF-1.7` | ID lengths    | Trailer Info | Xref subsections / entries |
| ----- | ------------------------------ | ------------- | ------------ | -------------------------- |
| T1    | `\n\n`                         | 4 / 16 bytes  | Absent       | 1 / 1237                   |
| T2    | `\n\n`                         | 16 / 16 bytes | `977 0 R`    | 479 / 520                  |
| T3    | `\r\n`                         | 16 / 16 bytes | `977 0 R`    | 1 / 1237                   |
| T4    | `\r\n`                         | 16 / 16 bytes | Absent       | 1 / 1237                   |
| T5    | `\r\n`                         | 4 / 16 bytes  | `977 0 R`    | 1 / 1237                   |
| T6    | `\n\n`                         | 16 / 16 bytes | Absent       | 479 / 520                  |
| T7    | `\n\n`                         | 4 / 16 bytes  | `977 0 R`    | 479 / 520                  |
| T8    | `\n`                           | 4 / 16 bytes  | Absent       | 1 / 1237                   |

All bases contain 519 in-use entries. Dense tables have 718 free entries; sparse tables have one.
Unlike round 3, this manifest supplies no base hashes. The report computes base-prefix hashes
for reference; only the complete-file hashes are verified against the supplied manifest.

## Interpretation and limits

T5 succeeds while its individual components failed as S1 and S3 in round 3. It retains both the
original CRLF header and the short first ID. That establishes a sufficient pair among the tested
constructions and rules out the header change or ID extension as necessary for this result.
The README's expected dense-xref/header pair is not supported: T1 and T8 both fail.

This does **not** mean every PDF needs dense xref entries and trailer Info. Round-3 S5 succeeds
without base-trailer Info after a broader qpdf rewrite. Also, adding base-trailer Info changes the
signing revision: pyHanko retains `977 0 R` when present, but uses a newly allocated `1244 0 R`
when absent. We have isolated a successful construction, not Acrobat's internal algorithm or a
pure base-parser rule.

A useful next confirmation, before changing the demo ebook, is to preserve this T5 case and test
its base construction with both signing writers, signed-only controls, and actual later edits
such as field filling and commenting. No such additional fixtures were created in this round.

## Record integrity

Sequence: T1, T2, T3, T4, T5, T6, T7, T8, then T5 and T1 again. Each result comes from the native
Acrobat UI and an explicit Validate Signature action. Screenshots were inspected interactively;
no standalone screenshots were saved. No PDF was saved or edited, and no engine, policy or sample
file was changed. All files from previous rounds are unchanged.

Full per-file messages, hashes and structural checks:
[ACROBAT-RESULTS-2026-09-14.json](./ACROBAT-RESULTS-2026-09-14.json).
