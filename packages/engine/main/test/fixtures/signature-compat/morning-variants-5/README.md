# Morning isolation, round 5: two defects, not one

Round 4 said: dense xref alone fails, trailer /Info alone fails, both together pass. The trailer
/Info matters only through a side effect: the ebook's object 977 is an indirect object whose whole
body is `976 0 R` (a bare reference), reached from a non-standard `/Info 977 0 R` key on the
catalog. When the trailer names 977 as /Info, the signing writer rewrites 977 as a real dictionary
while updating ModDate; when it does not, 977 stays a bare reference. So the hypothesis is two
independent defects: (1) a cross-reference table with unused numbers below /Size that have no
entry at all, (2) an indirect object that is only a reference. Each alone makes Acrobat's update
analysis report corruption. Same recipe: pyHanko signs with the trusted corpus key, one
unreferenced object is appended.

| probe | base changes | expected if the hypothesis holds |
|:--|:--|:--|
| U1 dense+977-fixed | dense xref; 977 rewritten as the dictionary 976 holds; no trailer /Info | VALID |
| U2 dense+catalog-info-removed | dense xref; the catalog's /Info key removed (977 unreachable) | VALID |
| U3 sparse+977-fixed | original sparse table (rebuilt), 977 fixed | INVALID |
| U4 sparse+catalog-info-removed | original sparse table (rebuilt), catalog /Info removed | INVALID |
| U5 sparse-rebuilt-control | original table rebuilt by the same code, nothing else changed | INVALID (proves the rebuild itself changes nothing) |

## Recorded observations

[Acrobat results, 2026-09-14](./ACROBAT-RESULTS-2026-09-14.md): **U1/U2 pass; U3/U4/U5 fail**,
matching the expected pattern. U2 and U4 repeat after reopen and explicit validation. The report
includes exact messages, categories, active-object and reachability checks, and a correction to
the earlier qpdf explanation: frozen S5 contains a numeric `976`, not a repaired Info dictionary.
