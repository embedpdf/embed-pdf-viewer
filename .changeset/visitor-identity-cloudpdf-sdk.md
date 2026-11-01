---
'@cloudpdf/sdk': minor
---

Share links that ask their visitors who they are: `visitorIdentity` on `client.shares.create` and `client.shares.update`, the visitor's answers on `client.shares.exchange`, and `visitor.identityRequest` in its response. `client.shares.visitors.list` lists a link's visitors with their answers and layer, and `client.shares.visitors.delete` erases one. `visitorLayerIdleSeconds` is now `visitorIdleSeconds`.
