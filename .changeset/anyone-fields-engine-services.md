---
'@embedpdf/engine-services': minor
---

Read and write a form field that anyone fills in (`forAnyone`), and lock it at the first signature after it holds a value, by one rule on the local and the cloud engine.

- **Stored** as `/ForAnyone true` in the field's `/EMBD_Metadata`, beside its group. A create and an update write it, `false` takes the entry away, and a copy, an export and an import keep it. An entry beside a group, or on a signature field, reads as `false`, and goes when an update leaves the field without a group.
- **Filling in.** Every fill check, a reset's, a values import's and an undo's or redo's included, lets every user who may fill in some field fill in such a field.
- **Signing.** A signature without a `lock` of its own now also locks every field anyone fills in that holds a value at that signing (text that isn't empty, a checkbox or radio button that is on, a selected option), whoever filled it in, the sender included; the FieldMDP lock names them beside the rest of the signer's group. This holds for a signature field in no group too, which locked nothing before and still locks nothing when no such field holds a value. A field still empty stays open for the next signer. A signing that names its own `lock`, and a document timestamp, add none.
- **A signature field's own lock.** A signature field that carries a `/Lock` of its own signs with that lock alone, when the signing names no `lock`: nothing is added to it, neither these fields nor the rest of its group. Before, a field in a group with a `/Lock` that didn't name exactly its group's fields refused to be signed (`SignatureRefused`), as the runtime refuses a lock other than the field's own.
- **Undo.** An update's undo puts who fills the field in back as a whole: its group and whether it is for anyone together, and only while both still hold what the update left. A field another update gave to someone since stays theirs, and the update's other properties still go back.
- **Rights.** Marking a field (a create, an update, a copy, an import that copies) takes `fields:set-group:all`; a restoring import keeps it under its own rights. `FormCopier` and `FormImporter` take an optional `forAnyoneOf` beside `groupOf`.

A document in which no field is marked behaves as before.
