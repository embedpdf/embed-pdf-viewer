---
'@embedpdf/engine-services': patch
---

A page whose parsed content is bigger than the whole parsed-page budget now
stays parsed between the jobs that use it, so the tiles, reads and re-renders of
a heavy drawing share one parse instead of parsing the page again for each job.
Pages that fit stay beside it within the budget, and it closes when the pages
jobs hold need that room.
