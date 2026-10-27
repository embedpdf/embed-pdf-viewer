---
'@embedpdf/core': minor
---

Documents from share links that wait for something. A failed open says what its share link waits for in `DocumentInfo.shareRequest` (the passphrase, with whether one was tried, or the visitor's answers), and `documents.retry(id, { sharePassword })` or `retry(id, { visitor })` opens it with them; answers add to the ones given before. Once open, a change waiting for the visitor's answers shows as `DocumentInfo.identityRequest` until `documents.identify(id, answers)` sends it or `documents.declineIdentity(id)` lets it fail.
