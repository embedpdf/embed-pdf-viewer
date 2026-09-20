---
'@embedpdf/react': minor
---

Add the `@embedpdf/react/signature` entry point with hooks for signing, signature
snapshots, validation verdicts, protection, target fields, events, and saved
signature libraries.

Make signature widgets selectable for signing or inspection, and allow
`useStampLibraries()` to filter libraries by kind. Use the stamp capability
contract in signature hooks to preserve plugin dependency boundaries.
