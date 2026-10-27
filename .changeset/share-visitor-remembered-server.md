---
'@cloudpdf/server': patch
---

A share link's visitor is remembered on every link except a per-visitor link that doesn't keep visitors' layers: the exchange answers `visitor.keep: true` for shared links too. A visitor who comes back in the same browser keeps their answers to the link's questions and stays the author of what they added, instead of being asked again on every page load and listed as a new visitor each time.
