---
'@embedpdf/angular': minor
---

NEW `@embedpdf/angular/actions` entry: `injectActionsUiAdapter(handlers?)` — Angular's spelling of React's `useActionsUiAdapter` (the `inject*` law), installing the SHARED default policy from `@embedpdf/web` so the two bindings can never drift; re-exports the `@embedpdf/plugin-actions` contract. The parity gate goes green (`actions` ported; `anchored` consciously added to PENDING).
