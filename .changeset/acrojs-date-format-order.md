---
'@embedpdf/core-acrojs': patch
---

`AFDate_FormatEx` reads a date in the field's own format before trying a JavaScript date, as
Acrobat does. A `dd/mm/yyyy` field showing `12/02/2027` stays 12 February instead of turning
into `02/12/2027`.
