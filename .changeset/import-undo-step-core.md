---
'@embedpdf/core': minor
---

A plugin can stage a change that one of the engine's own verbs makes, such as an import: `ctx.changes.stage({ label, send })`. The queue calls `send(doc, { opId })` when it sends the change, so the verb keeps its place among the other changes, and the history records it as one step. `opId` names the change when the caller of the verb chose an id, and `history: false` keeps it out of the history. The new `HistoryOptions` type is the `history?: false` option a verb takes from its caller.
