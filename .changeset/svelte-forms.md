---
'@embedpdf/svelte': minor
---

Add the form and signature entry points to `@embedpdf/svelte`.

- `@embedpdf/svelte/form`: `<FormLayer>` goes between the `<Stage>` tags and puts a real HTML control over each field of its page while the active tool fills forms: an editor in the field's own font for a text box (Enter or leaving the field commits, Escape puts the value back), the field's picture as a checkbox or radio button, an invisible native dropdown, a visible native list box that keeps its scroll position while a choice is written, a click target for a push button, and "sign here" for a signature field with the signature plugin. A press on a field stays out of the page below it and still runs the field's PDF actions, and the focus ring and the edge of a field without a border take their colors from the form settings (`--epdf-form-*` CSS variables win). `useForm()`, `useFormState()` (a reactive object: `fields`, `status`, `formKind`, `selectedField`), `useFormSettings()` and `useFormEvent()`; `useFormValue(ref)` is one field's value as `{ current }` that changes only when that field changes, and takes a function to follow a prop.
- `@embedpdf/svelte/signature`: `useSignature()`, `useSignatureState()` (a reactive object: `signatures`, `target`, `busy` and the rest), `useSignatureSettings()` and `useSignatureEvent()`. `useSignerRows()` is the people whose marks the stamp plugin holds, each with their signatures and initials, as `{ current }`. The signers (`personalSigner` with `indexedDbKeyStore`, `webCryptoSigner`, `remoteSigner`, `createTestSigner`) come from the same import.

Each entry re-exports its plugin, so `formPlugin()` comes from the same import as `<FormLayer>`.
