---
'@embedpdf/plugin-actions': minor
---

- `registerFormReader()`: scripts, widget events, field actions and Hide actions read the form plugin's form, with the fills still on their way, instead of reading it from the engine each time.
- The form commit sink answers once the effects are staged: `applied` means they show and are on their way, and a refusal arrives through the change queue.
