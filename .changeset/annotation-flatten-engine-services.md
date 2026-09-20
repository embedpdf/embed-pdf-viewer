---
'@embedpdf/engine-services': minor
---

New `annotations.flatten` and `annotations.exportAppearance` worker jobs over the runtime's set-based flatten: resolve refs on the page, hand the set to one candidate plan, and either paint in place (bumping that page's revision and weak-annotation state like a page flatten) or into a scratch document returned as PDF bytes.

Every page list now includes the catalog's named-page registrations (`namedPages`), read from the runtime with each value classified as page, template, or dangling. New `pages.setName` and `pages.removeName` worker jobs register, rename, or remove `/Names /Pages` entries and return the fresh layout; page deletion drops the registrations that pointed at the page.

Annotation `/Name` is written and read as text: note and file-attachment icons map their ids to PDF names, stamps accept any non-empty name (standard or custom) and report custom names verbatim instead of collapsing them, and a stamp patch with `name: null` removes the entry without touching the appearance.
