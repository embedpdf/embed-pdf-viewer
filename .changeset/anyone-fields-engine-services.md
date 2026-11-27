---
'@embedpdf/engine-services': minor
---

Read and write who fills a form field in as one assignment, a group, anyone or unassigned, and lock a field anyone fills in at the first signature after it holds a value, by one rule on the local and the cloud engine.

- **Stored** in the field's `/EMBD_Metadata`: a group as `/GroupID`, as before, anyone as `/ForAnyone true`, unassigned as neither. A create and an update write it, and a copy, an export and an import keep it. A `/ForAnyone` entry beside a group, or on a signature field, counts for nothing, and goes when an update leaves the field without a group.
- **Writes.** A create and an update take `assignment` or the `groupId` shorthand, each from any assignment: a group id for that group, `null` for unassigned. Both in one write, or anyone on a signature field, fail with `InvalidArg`, and nothing is written.
- **Filling in.** Every fill check, a reset's, a values import's and an undo's or redo's included, lets every user who may fill in some field fill in a field anyone fills in.
- **Signing.** A signature without a `lock` of its own now also locks every field anyone fills in that holds a value at that signing (text that isn't empty, a checkbox or radio button that is on, a selected option), whoever filled it in, the sender included; the FieldMDP lock names them beside the rest of the signer's group. This holds for a signature field in no group too, which locked nothing before and still locks nothing when no such field holds a value. A field still empty stays open for the next signer. A signing that names its own `lock`, and a document timestamp, add none.
- **A signature field's own lock.** A signature field that carries a `/Lock` of its own signs with that lock alone, when the signing names no `lock`: nothing is added to it, neither these fields nor the rest of its group. Before, a field in a group with a `/Lock` that didn't name exactly its group's fields refused to be signed (`SignatureRefused`), as the runtime refuses a lock other than the field's own.
- **Undo.** An update's undo puts the assignment back whole, also when the update named only `groupId`, and only while it still holds what the update left: a field another update gave to someone since stays theirs, and the update's other properties still go back.
- **Rights.** Anyone takes `fields:set-group:all`, a group `fields:set-group` for it, and unassigned form design alone, on a create, an update, a copy and an import that copies; the assignment a field already has takes none, and a restoring import keeps each field's under its own rights. `FormCopier` and `FormImporter` take an optional `assignmentOf`, which decides a field's whole assignment; `groupOf` becomes optional, and decides a group's or an unassigned field's only without it.

A document in which no field is anyone's behaves as before.
