---
'@cloudpdf/contract': minor
---

Share links take `visitorIdentity` (`ShareVisitorIdentitySchema`: the fields to ask, each required or optional, `ask`, `purpose`, `privacyUrl`), and the exchange request takes the visitor's answers (`ShareVisitorAnswersSchema`). The exchange response's `visitor.identityRequest` (`ShareVisitorIdentityRequestSchema`) says what a link that asks before the first change still needs. New operations `shares.visitors.list` and `shares.visitors.delete`, with `ShareVisitorRecordSchema`. Admin error payloads may carry `error.details`. `visitorLayerIdleSeconds` is now `visitorIdleSeconds`.
