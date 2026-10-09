---
'@cloudpdf/server': minor
---

Every multipart request and answer has one shape: a JSON `body` part, and each file as a part `resource:<key>` that the body names by role, `resources: { <role>: <key> }`. Annotation create and update, page insert, attachments, a signature's drawn appearance, signature prepare and change ops name their files this way; bundle imports and exports and appearance batches call their JSON part `body`, and an appearance batch's images are `resource:<key>` parts. A named key with no part, and a part nothing names, are refused.
