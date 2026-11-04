---
'@embedpdf/plugin-search': patch
---

A search asks for snippets only when the session may copy text (`doc.text.copy`). Before, it always asked for them first and, when refused, searched again without them: two requests for every search in a session without copy rights. `findAll(query, { snippets: true })` now refuses with `permission-denied` (naming `doc.text.copy`) without asking the engine. If the engine still refuses snippets the session looked allowed to have, the search falls back to matches without them as before.
