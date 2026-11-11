---
'@embedpdf/engine-services': minor
---

The worker applies the new op `annotations.copy`. It reads each named annotation, creates the copies as one change, all or nothing, and records the reverse, so an undo deletes them. A copied stamp places the drawing its original places, so the document gets no second drawing, and a copied attachment gets the same file bytes with its dates. Every create is checked before the first write: the session needs `doc.annotate.read` and the right to create each kind. A copy carries what a bundle may: as many annotations, and as many drawings and files, of that size each and together. A drawing counts once however many copies place it. Past a limit the copy is refused with `PayloadTooLarge` before anything is written. `document.applyChanges` takes the deployment's `limits`; without them the defaults apply.
