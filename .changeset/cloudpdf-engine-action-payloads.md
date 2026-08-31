---
'@cloudpdf/engine': minor
---

Action trees parsed from the hosted engine now carry full interpreter payloads (the discriminated `PdfActionNode` union) and `DocumentActionsSnapshot.openDestination`; the snapshot schema defaults `openDestination` so responses from older deployments still parse. Cloud actions conformance now gates the payload matrix and the destination-form `/OpenAction` on the HTTP + native-runtime path.
