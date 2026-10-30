---
'@embedpdf/viewer': minor
---

The `fetch` config key: your own `fetch` for every document at a URL (`src`, `documents` and `{ kind: 'url' }` in code), to add headers or cookies. It follows its prop, as `element.fetch` too: the next download uses a new one, and the viewer stays. A server that answers 401 or 403 shows in the tab as not allowed, and **Try again** calls `fetch` again.
