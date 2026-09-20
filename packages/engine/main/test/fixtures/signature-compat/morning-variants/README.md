# Morning-file isolation set

All files share the same first 928,910 bytes: the public `ebook.pdf` viewer asset signed once with a
test certificate (`signature_1-signed valid.pdf`, which Acrobat accepted). No personal data.

| file                               | last revision                                                 | question                                                          |
| :--------------------------------- | :------------------------------------------------------------ | :---------------------------------------------------------------- |
| A-original-rejected                | page 184 + widget 1240 byte-identical, /Size 1248, new /ID[1] | re-observe: exact properties text AND the panel change categories |
| B-page-only                        | page 184 byte-identical, /Size 1246                           | is the page rewrite alone rejected on this base?                  |
| C-widget-only                      | widget 1240 byte-identical, /Size 1246                        | is the widget rewrite alone rejected on this base?                |
| D-page-and-widget-same-size-and-id | both, /Size 1246, /ID unchanged                               | the original minus the Size/ID differences                        |
| E-font-dict-only                   | /DR font 1238 byte-identical                                  | is ANY appended rewrite rejected on this base?                    |
| F-new-orphan-object-only           | one new unreferenced object, /Size 1247                       | is any appended revision at all rejected on this base?            |
| G-valid-control                    | no appended revision                                          | control (the file Acrobat accepted)                               |

Record per file: overall status, the modification sentence, every change category, and whether the
signer was trusted at the time.

The [2026-09-14 Acrobat results](ACROBAT-RESULTS-2026-09-14.md) and
[complete JSON observation record](ACROBAT-RESULTS-2026-09-14.json) cover all
seven files. A–F are rejected, including the font-only and orphan-object
variants; G is reported unchanged with signer trust unknown. The PDF bytes
and this set's manifest were preserved.
