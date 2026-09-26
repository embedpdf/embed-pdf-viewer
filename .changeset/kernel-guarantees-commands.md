---
'@embedpdf/plugin-commands': patch
---

Declare the optional i18n and shell dependencies, and create the command registry per kernel instance instead of in the plugin definition, so one definition installed in two viewers no longer shares commands.
