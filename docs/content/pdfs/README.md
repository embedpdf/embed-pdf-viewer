# Demo PDFs

The documents the docs' live examples open. Each one is built from HTML, so its design, text and
links stay editable here, and anything Chrome can't print is added by the engine, so every PDF is
built the same way each time.

```sh
pnpm --filter @embedpdf/docs-content pdfs          # every document
pnpm --filter @embedpdf/docs-content pdfs forms    # one
```

Each PDF lands in both sites' `public/pdfs/<folder>.pdf`, so embedpdf.com and cloudpdf.com both
serve it at `/pdfs/<folder>.pdf`. The build needs Google Chrome installed (`CHROME_PATH` names
another).

## What a document is

One document serves one family of examples: the ones that turn on the same things. Four rules
keep it honest, since a reader judges the product by what the example shows:

- **It never instructs.** No "click", "your turn" or "try each one": it reads like a document
  your users would open, such as a manual, an invoice or a proposal. Nothing on it is about the
  viewer.
- **What it shows works.** Everything on its pages works in every example that opens it. A note
  nobody can read, a link nobody can follow, a box nobody can type in: none of them belong. Notes
  and replies go only in a document whose examples show comments.
- **The example's hint says what to try.** Only the example knows what it turned on, so its hint
  and the page's **Try it** carry the instruction, and name what's on the document (the note next
  to the title, the box around the downloads row).
- **It belongs to a made-up company.** With our name on it, an invoice or a notice would read as
  a real one of ours. Every document but the welcome is Fernquill Ltd's or Lanternfield's
  (`shared/annotations.mjs`), with that company's logo and colours (`<body class="fernquill">`).
  Their email and web addresses end in `.example`, a domain that never reaches anyone; a link a
  reader can follow goes to a real page. The build fails when a made-up company's document names
  EmbedPDF or CloudPDF.

The welcome is the one document that's ours: "Documents belong on the web", built once as each
brand, EmbedPDF's for embedpdf.com and CloudPDF's for cloudpdf.com. `shared/brand.js` gives the
elements it marks with `data-brand` the brand named by `?brand=`: open
`welcome/document.html?brand=cloudpdf` to see CloudPDF's pages. Each version names only its own
brand.

## A document

A folder with two files:

- **`document.html`**: the pages. One `<section class="page">` per US Letter page, styled with
  `../shared/document.css` (the palette, the fonts and the page box). Open it in a browser to see
  the pages as they print. Chrome turns every `<a href>` into a real link: `#page-3` goes to that
  page, `https://…` and `mailto:…` open outside the document.
- **`bake.mjs`**: what the engine adds after Chrome printed the pages, in `edit()` steps:

  ```js
  export const company = FERNQUILL; // from ../shared/annotations.mjs

  export default async function bake({ edit }) {
    await edit(async ({ doc, pages, place }) => { /* as the company */ });
    await edit({ userId: 'u_381', displayName: 'Dana Smith' }, async ({ doc }) => { /* as Dana */ });
  }
  ```

  Each step opens the document as one person, so what it adds carries their name, as notes and
  replies from several reviewers do. A step gets the engine, the open document (`doc`), its
  `pages`, and `place(name)` / `places(name)`: the page and rectangle of each element the HTML
  marks with `data-pdf="<name>"`, in PDF points. A radio group's buttons each carry their value
  in `data-pdf-value`. Refs stay valid from one step to the next.

  After the steps the build saves the document whole, which would undo a signature. So a bake that
  signs exports a `sign()` step too, which runs on the saved file and adds to it:

  ```js
  export async function sign({ engine, doc, pages, place, publish }) {
    /* sign a field with @embedpdf/core-signature */
    publish('.cer', certificate); // → <folder>.cer, next to the PDF
  }
  ```

  `publish()` puts a file next to the PDF, such as the certificate an example trusts. The build
  runs with `tsx`, so a bake can import a workspace package that ships TypeScript source, as
  `@embedpdf/core-signature` does.

The HTML draws a field's box; the bake puts the field over it, so moving a box in the HTML moves
its field. Text markup needs no marker: the bake finds the phrase with `doc.search.query()` and
marks the lines it covers. Give each annotation an `nm`, so the samples can find it by name. The
build fails when a marked box has no use in `bake.mjs`, and when a page prints text in a font
other than the shared ones.

Most documents are ordinary ones (a report, a proposal), so `document.css` has their pieces: a
`<section class="page sheet">` with a `.letterhead`, a `.title` and `.meta` line, a `.lead`,
headings, tables and a `.page-footer`, and a `.note-slot` in the margin of a `.with-note` block
for a note's icon. `shared/annotations.mjs` has the reviewers (`DANA`, `ADA`) and helpers that
write annotations the way the viewer does: `markText()`, `addNote()`, `reply()`, `setStatus()`.

## From a design tool

A page made in a design tool, such as Claude Design, keeps its markup: copy each page's
`<section class="page">` into `document.html`, link `../shared/document.css` in its `<head>`, and
drop the tool's own scripts and stylesheets.

- **Fonts.** `document.css` loads Inter, Manrope and JetBrains Mono as fixed weights. A variable
  font, as Google Fonts serves them, prints as Type3 drawings, which select and search badly.
- **Symbols.** The fonts hold Latin characters only. Draw arrows and other symbols as SVG
  (`<svg class="arrow">` for the arrows after a label).

## In a sample

Each document has a key in `../documents.mjs`. A sample opens it with a
`// [!doc-source <key>]` block that fetches `/pdfs/<key>.pdf`; the docs sync gives the cloud
site's copy its own form of the block, which opens the document's share link.

## On CloudPDF

cloudpdf.com's examples open the same PDFs from CloudPDF, with CloudPDF's welcome. `pdfs:cloud`
uploads cloudpdf.com's copy of each one and creates a share link for it that gives each visit its
own layer, changed only by what that document's examples do. It records the document and the
link in `cloud.json`:

```sh
CLOUDPDF_API_TOKEN=… CLOUDPDF_TENANT_ID=… pnpm --filter @embedpdf/docs-content pdfs:cloud
```

`--dry-run` only says what it would do. A document already in `cloud.json` keeps its link, which
is set to the script's settings again; one whose PDF changed since is reported, since a link can't
point at a new document yet.
