---
'@embedpdf/plugin-commands': minor
---

A command's label is a language's string under the command's id first, then under its `labelKey`, in the current language and then in the fallback one, then `label`, then the id. So `addTranslations('nl', { 'document:download': 'Kopie opslaan' })` relabels that one command in Dutch whichever key its label is under, and a command with only a `label` can be translated by its id. A command with a `labelKey` that no language has now shows its id rather than the key.
