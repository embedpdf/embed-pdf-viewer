---
'@embedpdf/core': minor
---

`@embedpdf/core/testing` gains `gate(engine)`, an engine whose documents hold every change until a test releases or refuses it, so a plugin's tests can see what the reads show while a change is on its way. A predicted `attachments.restore` op lets a view draw an undone attachment removal before the engine answers.
