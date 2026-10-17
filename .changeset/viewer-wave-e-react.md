---
'@embedpdf/react': patch
---

The development warnings stay out of a production build. The check read `typeof process` first, which no bundler replaces and a browser doesn't have, so a production build of an app (with Vite, say) counted as development and showed the warnings to its users. It now reads `process.env.NODE_ENV`, which the bundler replaces, and counts as development only on a page with no bundler at all. `<Viewer>`'s warning about a changed engine or plugin list goes through the same check.
