# Morning isolation, round 4: which combination is the minimum

Round 3: S1-S4 (one change each) fail, S6 (all four) passes, S5 (qpdf rewrite, which keeps the
short ID and has no trailer /Info) passes. So at least two changes are needed together, and the ID
and the trailer /Info are not necessary. Same recipe as before: the ebook with the listed changes,
signed by pyHanko with the trusted corpus key, plus one unreferenced object.

| probe | changes to the base | reading |
|:--|:--|:--|
| T1 dense+lf | dense xref + header `\r\n` -> `\n\n` | the expected minimal pair |
| T2 id+info+lf | S6 without the dense xref | fails -> dense xref is necessary |
| T3 dense+id+info | S6 without the header change | fails -> the header change is necessary |
| T4 dense+id | | control pair |
| T5 dense+info | | control pair |
| T6 id+lf | | control pair |
| T7 info+lf | | control pair |
| T8 dense+true-lf | dense xref + header `\r\n` -> `\n` (one byte shorter, every offset shifted) | does the blank second line matter, or any non-CRLF header? |

Record per file: status, the modification sentence, and change categories (the five "Annotations
Modified" rows seen on S5/S6 are the ebook's own annotations, a panel artefact like corpus 01/89).

## Recorded observations

[Acrobat results, 2026-09-14](./ACROBAT-RESULTS-2026-09-14.md): **T3 and T5 pass** with subsequent
changes; T1, T2, T4, T6, T7 and T8 fail. T5 (dense xref + trailer Info) is the smallest successful
combination tested here. The expected dense-xref/header pair above is not supported. The report
includes exact properties, categories, repeated T5/T1 checks, and independent byte verification.
