---
'@embedpdf/core-acrojs': minor
---

`doc.submitForm(...)` emits a submit INTENT (Phase 4): both Acrobat forms — positional `(cURL, bFDF, bEmpty, aFields)` and the argument object (`cURL/aFields/bEmpty/cSubmitAs/bGet`) — become a `{kind:'submitForm'}` UI effect (include-mode field names; `cSubmitAs` beats `bFDF`; nothing in the VM ever touches a network — resolution and the sink chain live outside). Doc-typed events now carry `event.target = the Doc object` (Acrobat's WillSave boilerplate does `event.target.getField(...)`). The v1-frozen posture constants are honest again: `submitForm: 'sink-chain'`, `catalogLifecycleActions: 'execute-on-verb'`, page/annotation events `execute-*` — the actions plugin's policy is the live authority these document.
