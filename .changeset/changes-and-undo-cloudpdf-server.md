---
'@cloudpdf/server': minor
---

Every layer write sends its worker job an `opId`: the request's `Idempotency-Key`, or one minted for the write. Results' `meta` carry `opId` and `undoable`; page-structure, metadata, attachment and signing results take them from the write.

Add `POST /v1/docs/{docId}/layers/{layerName}/changes`: user actions, each a change whose ops apply in order in one layer transaction, all or none, or `{ opId, undoOf }`, the undo of an earlier change. One request runs as one worker job and one commit: each change stands on its own (a refused one rolls back alone), and the 200 answers every change in order, applied with its result or refused with its error. Bytes travel as multipart `resource:<key>` parts the JSON names by key. At most 64 changes per request and 512 ops per change.

Each answered change keeps its answer under its `opId` in the new `change_outcomes` table (migration 033), refusals included, so a retry gets the same answer and a different change under an answered `opId` is refused (`IdempotencyKeyReused`). An applied change keeps what undoes it: a record beside its answer and its captures as one object-store blob. Only the user who made a change may undo it; a redaction, a flatten, a form repair or a completed signature ends undo for the changes before it (`layers.undo_horizon`, `UndoUnavailable`). Answers are kept 30 days (`CLOUDPDF_CHANGE_RETENTION_DAYS`); the sweeper deletes expired answers with their captures, and the records and captures of changes no undo can reach.

Every change that wrote gets one audit row (kind `change`, its `opId` as idempotency key, `undo_of` naming what an undo undid). The single-op annotation, form and metadata routes now run as one-change requests: their audit rows keep their kinds and payloads, and their `Idempotency-Key` names the change, so `{ undoOf }` undoes them.

The event stream's rows carry `undoOf`.
