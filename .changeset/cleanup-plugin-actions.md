---
'@embedpdf/plugin-actions': minor
---

The actions plugin keeps no state of its own: `ActionsAction` and `ActionsState` are no longer exported. The per-page trigger cache is cleared by flattens, redactions and new document versions, and a read that was in flight when its page changed no longer fills the cache with a stale tree. `ScriptRealmTarget.document()` needs only a document's name, page count and pages (`ScriptDocument`). The `/internal` entry is removed; hosts use `/contract/host`.
