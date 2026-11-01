---
'@cloudpdf/server': patch
---

A share link can say who its visitors are, for a link made for one person: `identity` on `shares.create` and `shares.update`, the same shape as `tokens.issue`'s (migration 043). Every session the link gives carries it, whoever opens the link: a field it sets is never asked, and a visitor's answer for it is ignored. Its `userId` replaces the visitor's own `visitor_<id>`; each visit still gets its own layer on a per-visitor link. A link that asks a field its identity sets is refused (400), on create and on an update checked against the link as it will be.
