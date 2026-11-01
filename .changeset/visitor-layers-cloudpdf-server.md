---
'@cloudpdf/server': minor
---

Share links can give each visitor a layer of their own. Every exchange names a visitor: the session token carries them as the author (`identity.userId` `visitor_<id>`), and a handle, an HMAC the link issued, brings them back on renewal. On a per-visitor link the session pins the visitor's layer, `visitor-<id>`, which is made at their first write and stamped with the link, the visitor and when they were last seen (migration 038); each exchange with the handle restarts that idle clock. `restart: true` deletes the visitor's layer and starts a new visitor, and a visitor whose layer was deleted comes back as a new one. Names starting with `visitor-` are refused for a link's shared layer and for issued tokens.
