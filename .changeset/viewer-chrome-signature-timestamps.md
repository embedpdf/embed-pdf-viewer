---
'@embedpdf/viewer-chrome': minor
---

The signature inspector shows a signature's timestamp: the time its timestamp authority vouches for and the authority's name, in the tone of the timestamp's verdict. When a signing fails at its timestamp, the sign dialog says so in the viewer's language: the timestamp service did not answer, or it refused. Three new strings, in all fifteen languages. `httpTimestampAuthority` and `createTestTimestampAuthority` are exported beside the signers.
