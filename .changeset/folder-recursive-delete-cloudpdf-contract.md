---
'@cloudpdf/contract': minor
---

`folders.delete` takes `recursive=true` to delete a folder with everything in
it. Without it, a folder that holds anything is still refused.
