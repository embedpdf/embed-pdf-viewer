---
'@embedpdf/engine-services': minor
---

- Form values, resets, options and defaults are worked out by engine-core's rules and written with the fork's plain writers. A value a field already holds writes nothing and can't be undone.
- Pages read their tab order; list boxes their top row; widgets their font as a face, so a registered font reads back as its key.
- A widget takes a registered font. A widget update that changes only its colour or size keeps its font and size, and a free text's border colour change keeps its font.
