# Validation data and document timestamps, judged by Acrobat

Twenty signed PDFs that carry long-term validation data (a `/DSS` store), document timestamps,
or both, each one opened and judged in Acrobat. `observations.json` holds Acrobat's verdict for
every signature in every file. It was compiled from Acrobat's own output and nothing in it was
typed by hand.

`packages/core/signature/test/acrobat-long-term.test.ts` holds the engine to it: a signature
Acrobat reports as altered must read `forbidden`, and one Acrobat reports as valid must not.
`longTerm.enabled` must be what Acrobat's line about long-term validation says, for each of the
32 signatures Acrobat spoke about.

## How they were observed

- Acrobat Pro 26.002.22031 on macOS, Nov 15 2026, in three rounds.
- Through Acrobat JavaScript: `signatureValidate()`, `signatureInfo()` and
  `signatureGetModifications()`.
- The test root was trusted for signed and certified documents. Files with validation data were
  judged with the test certificate authority stopped, so every answer came from the file.

## How they were made

A throwaway certificate authority (certomancer 0.16) issued a signer, an intermediate with an
OCSP responder and a CRL, and two timestamp authorities, all on `localhost:9413`. The addresses
in the certificates point there, so they answer nothing today, which is the point of these
files.

- `ours-*` and the `iso-p1+*` and `iso-p2+*` files start from a file EmbedPDF signed and
  timestamped (`ETSI.CAdES.detached`): an approval signature, a certification that allows no
  changes (P=1), or one that allows form filling (P=2).
- pyHanko 0.38.1 then added validation data and document timestamps, as an implementation that
  shares no code with the engine. In the `iso-` files each revision adds exactly one thing:
  pyHanko's own document information and metadata updates were switched off.
- `pyhanko-*`, `iso-p1-pdf20*` and `iso-p1-answers-in-signature.pdf` were signed by pyHanko from
  the start.
- `acrobat-lt.pdf` and `acrobat-lta.pdf` are an EmbedPDF approval signature that Acrobat itself
  took further, with Add Verification Information and with a document timestamp.

`made` in `observations.json` says it per file. Two entries carry `judgedCopyKept: false`:
Acrobat judged a fresh copy of the file it had just written, under another name, and that copy
was not kept. The file here is byte for byte the one Acrobat wrote.

## What Acrobat showed

| After the signature                                | Acrobat                         |
| :------------------------------------------------- | :------------------------------ |
| Approval, then validation data                     | Valid, LTV enabled              |
| Approval, then validation data and a timestamp     | Valid, LTV enabled, on both     |
| No changes allowed (P=1), then validation data     | **Certification invalid**       |
| The same in a PDF 2.0 file                         | **Certification invalid**       |
| P=1, then a document information dictionary        | **Certification invalid**       |
| P=1, then a document timestamp                     | **Certification invalid**; the timestamp itself valid |
| P=1, the answers inside the signature, no revision | Valid, LTV enabled              |
| Form filling allowed (P=2), then validation data   | Valid, LTV enabled              |
| P=2, then validation data and a timestamp          | Valid, LTV enabled, on both     |

Two more things the files hold:

- **Acrobat's own document timestamp** (`acrobat-lta.pdf`) moves the page's `/Annots` from an
  array inside the page into an object of its own. The earlier signature stays valid.
- **Four files add something to that page afterwards**, where the list already is an object of
  its own. Acrobat calls every earlier signature in them valid.

  | File                                    | What was added, and how the list changed                                             |
  | :-------------------------------------- | :----------------------------------------------------------------------------------- |
  | `grow-acrobat-lta+second-timestamp.pdf` | pyHanko, a document timestamp: the list object grows in place.                       |
  | `grow-acrobat-lta+second-signature.pdf` | pyHanko, a signature in a new box: the list object grows in place.                   |
  | `acrobat-lta+acrobat-comment.pdf`       | Acrobat, a square comment and its popup: the list object grows in place.             |
  | `acrobat-lta+acrobat-timestamp.pdf`     | Acrobat, a second timestamp: the page points at a new list object, the old one stays. |

  The engine agrees on all four. For the fourth, no revision after the first timestamp wrote
  the old list, so the engine reads it from the earlier revision's bytes to see that the new
  list kept every entry.
- **Acrobat says "LTV enabled" on a certification it calls invalid.** That line alone says
  nothing about validity.

ISO 32000-2 lets validation data and document timestamps follow a P=1 certification, and pyHanko
accepts every one of these files. Acrobat does not, in a PDF 1.7 file or a PDF 2.0 file. The
engine follows Acrobat.

## The files are fixed

They hold timestamps and answers from one moment, so they cannot be made again byte for byte.
`observations.json` has each file's SHA-256, and the test checks it. To add a case, add the
file, have Acrobat judge it, and add its verdict from Acrobat's output.
