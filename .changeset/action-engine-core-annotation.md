---
'@embedpdf/core-annotation': minor
---

Session-visibility overlay: `Model.sessionHidden` with `setSessionHidden`/`forgetSessionHidden`/`clearSessionHidden` messages, composed through the new `effFlags`/`effBearer` lenses so Hide actions and scripts flip presentation-only visibility (paint, hit-testing, selectability, handles) without ever touching the document `/F` flags — and a session-SHOWN annotation is live, not painted-but-dead. The overlay survives page reloads and is forgotten only on true deletes.
