---
'@embedpdf/plugin-form': minor
---

- What the document's scripts change is written as one change (`doc.apply`): all of it, or none of it. A refusal throws, as a plain value write does.
- `FormCommitResult.effectsResult` is removed: `status` says how the write ended (`unchanged` when it changed nothing).
- A reset is one `doc.forms.reset`, then the recalculation.
