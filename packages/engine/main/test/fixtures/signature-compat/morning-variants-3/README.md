# Morning isolation, round 3: bisecting the base

Round 2 showed that on the ebook base ANY second update fails in Acrobat, whichever writer signed
it and with the signer trusted (H valid, I2 invalid). So the cause is in the base file. Each probe
below is the ebook with ONE structural change, signed by pyHanko with the trusted corpus key, plus
one unreferenced object appended (the I2 recipe). The `base-*.pdf` files are the modified bases,
for reference only; validate the `morning-*-signed-plus-orphan.pdf` files.

| probe | the one change to the base | if it becomes VALID with "subsequent changes" |
|:--|:--|:--|
| S1-dense-xref | the original xref (479 subsections, gaps for unused numbers) rewritten as one dense `0 1237` subsection with explicit free entries | Acrobat's update analysis needs a dense cross-reference table |
| S2-16-byte-id | the 4-byte `/ID [<736F6D65> ...]` ("some") replaced by a 16-byte ID | the short document ID is the cause |
| S3-info-in-trailer | `/Info 977 0 R` added to the trailer (the original keeps /Info only inside the catalog) | the missing trailer /Info is the cause |
| S4-header-lf | `%PDF-1.7\r` header line ending changed to `\n` | the CR-only header line is the cause |
| S5-qpdf-rewrite | the whole file rewritten by qpdf (no object streams) | some structural property qpdf normalises; then bisect further |
| S6-dense-id-info-lf | S1 + S2 + S3 + S4 together | the byte-level fixes suffice; if S6 fails while S5 passes, it is something else qpdf changes |

Record per file: status, the modification sentence, and any change categories.

## Recorded observations

[Acrobat results, 2026-09-14](./ACROBAT-RESULTS-2026-09-14.md) record the six explicit validations,
exact modification messages, categories, and byte checks. S1–S4 are INVALID; S5 and S6 are VALID
with subsequent changes. The report also documents the actual header bytes, which differ from
the bare-CR description above.
