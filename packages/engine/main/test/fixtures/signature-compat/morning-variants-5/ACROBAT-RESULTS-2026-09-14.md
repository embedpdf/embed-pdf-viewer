# Acrobat observations: morning isolation, round 5

Observed 2026-09-14 in Adobe Acrobat Reader, user-reported build **26.2.21869.0**
(installed bundle **26.002.21869**), macOS 26.6 / arm64 / Apple M1 Max.
All five identities were trusted; no trust or preference settings were changed.

## Result

**The predicted pattern holds: U1 and U2 pass; U3, U4 and U5 fail.**

| Probe | Base construction                                   | Explicitly validated result   | Categories       |
| ----- | --------------------------------------------------- | ----------------------------- | ---------------- |
| U1    | Dense xref + object 977 replaced with a dictionary  | VALID; subsequent changes     | Five annotations |
| U2    | Dense xref + catalog Info removed; 977 retained     | VALID; subsequent changes     | Five annotations |
| U3    | Sparse xref + object 977 replaced with a dictionary | INVALID; altered or corrupted | None displayed   |
| U4    | Sparse xref + catalog Info removed; 977 retained    | INVALID; altered or corrupted | None displayed   |
| U5    | Rebuilt sparse xref, unchanged active base objects  | INVALID; altered or corrupted | None displayed   |

U2 and U4 were closed, reopened and explicitly validated again. Both verdicts and every
transcribed property message repeated.

## Exact Acrobat messages

U1 and U2 show:

> Signature is VALID, signed by EmbedPDF PUBLIC TEST KEY ONLY.
>
> The revision of the document that was covered by this signature has not been altered; however, there have been subsequent changes to the document.

U3, U4 and U5 show:

> Signature is INVALID.
>
> The document has been altered or corrupted since the Signature was applied.

U1/U2 display **Annotations Modified**, with these rows:

- Square annot on page 1
- Circle annot on page 1
- PolyLine annot on page 1
- Polygon annot on page 1
- Ink annot on page 1

As in earlier rounds, the initial successful-file panel said the document had not been modified.
The subsequent-changes message above comes from explicitly clicking **Validate Signature**.

All five report a valid signer identity, trust from a manually imported identity, successful path
validation, validation at signing time, and no revocation checking for a directly trusted
certificate. The reason is “base bisection 3”. Signing times are `2026/09/14 12:42:19 +03'00'`
for U1–U4 and `2026/09/14 12:42:20 +03'00'` for U5. The field is `signature_1 on page 2`.
The trusted test certificate has SHA-256
`0f13f8fc08b2c73b9142fdd9fa9bffcc7c939e134dde6a6bb7ce4d7d91b22d74`.

All five also display this permission text. It is transcribed literally, not used as independent
proof of the signature's certification role:

> The certifier has specified that Form Fill-in, Signing and Commenting are allowed for this document. No other changes are permitted.

## What the bytes confirm

All five file hashes match `MANIFEST.json` before and after inspection. Strict pyHanko parsing
finds three revisions and one signature covering the second. OpenSSL verifies each CMS against
the exact ByteRange bytes, without performing certificate-chain trust validation. Every final EOF
has a line ending. The final revision introduces exactly one unreferenced object, rewrites no
existing object, and changes no effective trailer value except `/Size` and `/Prev`.

Thus the annotation-category rows are UI observations, not evidence that these probes edited
five annotations after signing.

All bases retain CRLF after `%PDF-1.7`, a 4-byte first ID and 16-byte second ID, and no trailer
Info. Each contains 519 in-use xref entries. U1/U2 have one dense subsection with 1237 entries,
including 718 free entries. U3–U5 have 479 subsections with 520 entries, including one free entry.
All in-use xref offsets resolve correctly.

The active object checks confirm:

| Probe | Active object 977              | Incoming references to 977 | Changed active base objects versus original |
| ----- | ------------------------------ | -------------------------- | ------------------------------------------- |
| U1    | Dictionary equal to object 976 | Catalog 183 only           | 977 only                                    |
| U2    | Bare reference `976 0 R`       | None                       | Catalog 183 only                            |
| U3    | Dictionary equal to object 976 | Catalog 183 only           | 977 only                                    |
| U4    | Bare reference `976 0 R`       | None                       | Catalog 183 only                            |
| U5    | Bare reference `976 0 R`       | Catalog 183 only           | None                                        |

Object 977 is unchanged by the signing revision in all five probes. Incoming-reference results
are the same in the base and signed revisions. Where present, 977 is the only active base object
whose entire value is an indirect reference.

The comparison parses all 519 active objects from their xref offsets through `endobj` and compares
the exact bytes against round-3 S1. The rebuilt bases retain some superseded object definitions
in their raw bytes; the table describes the active definitions selected by the xref, not an
unqualified text search. U5's active object bytes are unchanged.

No base hashes were supplied in this round's manifest. Base-prefix hashes are included in the
JSON for reference; only complete-file hashes are checked against supplied values.

## Earlier-writer checks and one correction

The supplied explanation of **T5** is confirmed: its base object 977 is `976 0 R`; its signing
revision replaces that object with a real dictionary containing `/ModDate`.

The explanation of **S5** needs a correction. In that frozen qpdf fixture, the catalog has
`/Info 2 0 R`, and object 2 is:

```text
2 0 obj
976
endobj
```

It remains a **number**, not a dictionary or another reference, in both the base and signed
revisions. S5 therefore removes the bare-reference shape, but it does not demonstrate a redirect
to the original Info dictionary. The old S5 bytes and observation record were not changed.

## Interpretation and limits

For this ebook and signing/append workflow, the results support both structural factors: xref
coverage gaps and the catalog-reachable bare-reference object. With a dense table, either
repairing active object 977 or removing its only incoming reference succeeds. The corresponding
sparse-table probes still fail, as does the rebuilt sparse control.

**Reachability matters:** U2 retains a bare-reference object and passes. A diagnostic that flags
any such object merely because it exists would contradict this result. Active xref resolution
also matters because superseded definitions remain in the raw bytes.

These results support investigating a scoped `base-unverifiable` diagnostic; they do not prove a
universal rule for every sparse table, every bare-reference object, every update type or every
Acrobat version. U5 shows that this particular rebuild retains the failure, not that every
rebuild is neutral. No standalone signed-only controls were supplied or opened in this round.
The external proposal was not reviewed or edited, and no policy or engine change was made.

## Record integrity

Sequence: U1, U2, U3, U4, U5, then U2 and U4 again. Each case was explicitly validated in the
native Acrobat UI. Screenshots were inspected interactively; no standalone screenshots were
saved. No PDF was saved or edited. All previous-round files, fixture PDFs, manifests, engine code
and sample ebook are unchanged.

[Full per-file messages, hashes and byte checks](./ACROBAT-RESULTS-2026-09-14.json).
