---
'@embedpdf/svelte': patch
---

`useRedactionState()` and `useSignatureState()` are typed like every other state reader, through the plugins' named state types (`StateReader<RedactionState>`).
