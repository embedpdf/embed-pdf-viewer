---
'@embedpdf/react': patch
---

The state hooks' published types name each plugin's state type (`useFormState: StateHook<FormState>`) instead of spelling out its fields. The declarations no longer carry a copy of engine types, which they did on some builds, from 34 kB to 229 kB with zod's types inside.
