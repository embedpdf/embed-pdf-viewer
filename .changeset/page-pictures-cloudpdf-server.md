---
'@cloudpdf/server': minor
---

Serve the four page picture families at both tiers: `render/pages`, `render/annotations`, `render/fields` and `render/all` (renamed from `render/annotated`, which now draws form fields too). Each takes `doc.render` plus the read of what it draws, pins the page counters of the planes it draws, and is stored under its own family.
