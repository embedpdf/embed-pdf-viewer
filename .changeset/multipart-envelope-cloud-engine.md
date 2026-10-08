---
'@cloudpdf/engine': patch
---

Sends and reads every multipart message in the one envelope: a `body` part naming each file by role, and `resource:<key>` file parts. A single-file write keys its file by its role's name.
