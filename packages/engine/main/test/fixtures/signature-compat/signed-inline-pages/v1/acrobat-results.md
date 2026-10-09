# Acrobat observations — signed inline pages v1

Observed 4 October 2026 in Adobe Acrobat 26.002.21931 on macOS 27.0 (26A428). The existing EmbedPDF PUBLIC TEST KEY ONLY identity was trusted. Each file was explicitly validated with Validate All Signatures; results were read from the expanded Signatures panel.

21 files / 23 signatures checked: 9 files fully valid; 12 files contain an invalid signature. Of the signatures, 11 are valid and 12 are invalid.

All 21 PDF hashes match the frozen corpus. No PDF was saved and no trust setting was changed. JSON contains the exact visible modification messages, check times, file hashes, and screenshot references. The ends of the long certification messages in S17, S18 and S20 were clipped by the pane and are marked as truncated.

[JSON register](acrobat-results.json) · [CSV register](acrobat-results.csv)

| Case | Test | Signature result(s) | Evidence |
| --- | --- | --- | --- |
| S01 | Baseline: approval signature; page 1 holds inline and object annotations. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S01-SignatureOne.png) |
| S02 | E4: recolour object-0 in place (new appearance stream); page 1 is not rewritten. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S02-SignatureOne.png) |
| S03 | E4: change the comment text of object-0 in place; no appearance change. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S03-SignatureOne.png) |
| S04 | Control: change the text of inline-0, which rewrites page 1. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S04-SignatureOne.png) |
| S05 | E1: fill ValueOne on page 1 (value and appearance). | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S05-SignatureOne.png) |
| S06 | E1: fill ValueTwo on page 2. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S06-SignatureOne.png) |
| S07 | E2: second signature in the existing empty field SignatureTwo on page 1. Record both signatures. | SignatureOne: **INVALID**; SignatureTwo: **VALID** | [SignatureOne](acrobat-screenshots/S07-SignatureOne.png); [SignatureTwo](acrobat-screenshots/S07-SignatureTwo.png) |
| S08 | E2: second signature in the existing empty field SignatureThree on page 2. Record both signatures. | SignatureOne: **INVALID**; SignatureThree: **VALID** | [SignatureOne](acrobat-screenshots/S08-SignatureOne.png); [SignatureThree](acrobat-screenshots/S08-SignatureThree.png) |
| S09 | E3: add a Square on page 2, which holds no inline annotations. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S09-SignatureOne.png) |
| S10 | Control: add a Square on page 1 (rewrites page 1). | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S10-SignatureOne.png) |
| S11 | Frozen list: delete object-0 from page 1 (rewrites page 1). | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S11-SignatureOne.png) |
| S12 | E5 baseline: inline annotations promoted to objects (own revision), then signed. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S12-SignatureOne.png) |
| S13 | E5: add a Square on page 1 after signing. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S13-SignatureOne.png) |
| S14 | E5: recolour the promoted inline-0 in place. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S14-SignatureOne.png) |
| S15 | E5: delete the promoted inline-1. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S15-SignatureOne.png) |
| S16 | E5: add a reply (/IRT) to the promoted inline-0. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S16-SignatureOne.png) |
| S17 | Baseline: certification P=3; page 1 holds inline and object annotations. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S17-SignatureOne.png) |
| S18 | E4 under P=3: recolour object-0 in place. | SignatureOne: **INVALID** | [SignatureOne](acrobat-screenshots/S18-SignatureOne.png) |
| S19 | E5 baseline under P=3: promoted before certifying. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S19-SignatureOne.png) |
| S20 | E5 under P=3: add a Square on page 1 after certifying. | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/S20-SignatureOne.png) |
| X01 | Extra P=3 indirect baseline control (previously unobserved). | SignatureOne: **VALID** | [SignatureOne](acrobat-screenshots/X01-SignatureOne.png) |

## What this set establishes

- S01 is valid before any post-signing edit. Every tested post-signing operation on the mixed-inline baseline fails the original signature (S02–S11), including object-only updates, filling fields on either page, adding a second signature on either page, and commenting on page 2. S07/S08 have valid second signatures and invalid first signatures.
- Promotion before signing passes the approval baseline and every tested subsequent comment, recolour, delete and reply (S12–S16). Edited cases report subsequent unsigned changes while retaining valid signatures.
- The mixed-inline P=3 baseline is already invalid (S17), as is its recolour (S18). Promotion before certification produces a valid baseline (S19) and a valid, permitted comment change (S20). The extra unedited indirect P=3 control also passes (X01).
- Acrobat displays Annotations Modified warnings even on the valid promoted and indirect baselines. Those warnings are recorded separately from signature validity.

These observations apply to this synthetic fixture corpus and this Acrobat build. They do not isolate every possible PDF structure or establish the behavior of untested writers. In particular, the set supplies no passing example of post-signing edits while retaining inline annotations anywhere in the signed document.
