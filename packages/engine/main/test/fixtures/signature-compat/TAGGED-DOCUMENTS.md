# Tagged documents: commenting after an approval signature

Date: 2026-10-25. **Inferred, not observed**: no tagged document is in the
corpus yet, so this note says what Acrobat should report and why. The probes at
the end would turn it into an observation.

## The case

A tagged PDF (Chrome with `tagged: true`, a Word export, most PDFs people
sign) carries a structure tree. Each element points at its parent (`/P`), its
children (`/K`) and the page its content sits on (`/Pg`), and a parent tree
maps the page's marked content back to the elements. A one-page agreement
printed by Chrome has 29 elements pointing at its page.

After an approval signature, someone adds a comment (a Square, an ink
stroke). The objects that change are exactly the ones in v3/88: the page
(`/Annots` gained an entry), the new annotation and its appearance stream.
Nothing in the structure tree changes. Its `/Pg` references still point at the
page object, under the same object number.

## What Acrobat reports

**Valid, later changes**, the same as v3/88, for these reasons:

- v3/88 (Square added with an explicit appearance after an approval signature)
  is observed as valid with later changes: commenting is allowed.
- Acrobat compares the two revisions object by object, by value: a page or
  field written again with the same value is unchanged (v3/54–62). Which
  unchanged objects refer to a changed object is not part of that comparison.
- In the tagged case, every changed object is one v3/88 changes, with the same
  change. The structure tree is unchanged, so there is nothing more to judge.

The control: the same agreement printed with `tagged: false`, with the same
edit, reads `valid` with the change `permitted` in our engine (2026-10-25).

## What we did

The analysis explains every reference to a changed object, so it reads the
structure tree's references to the page as well. Those references form loops
(`/P` up, `/K` down, the parent tree across), and walking every path through
them ran out of budget: the page's usage was incomplete and the verdict
`indeterminate`. The resolver now treats each loop as one unit, reads each
object once, and writes a route inside a loop as `…`
(`catalog:StructTreeRoot/…/Pg`). The tagged case is now `permitted`, as
Acrobat should report it. Outlines (items linked by `/Next` and `/Prev`) and
an annotation with its popup are loops of the same kind, handled the same way.

A change inside the tree is still judged: an attribute object under an
element, changed after the signature, is forbidden with its usage complete
(`catalog:StructTreeRoot/…/A`).

## Open

- **Probe a tagged v3/88.** An approval control on a tagged page, and the same
  with a Square added. Expected: valid, unchanged; valid, later changes.
- **Probe Acrobat's own tagged comment.** With Tag Annotations on (Tags panel
  options), Acrobat also edits the structure tree when it adds a comment: a new
  `/Annot` element with an object reference to the annotation, the parent
  element's `/K`, the parent tree, `/ParentTreeNextKey`, and `/StructParent`
  on the annotation. We judge those changes forbidden (no rule explains them).
  Acrobat's reading is unknown.
- **Very large trees.** The resolver reads at most 20,000 objects per side. A
  structure tree larger than that (around 20,000 elements, a long document)
  is still `indeterminate`. The whole analysis took about 1.5 s at that size
  on WASM and grows linearly, so the budget can be raised if such documents
  matter.
