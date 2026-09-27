---
'@embedpdf/engine-runtime': patch
---

Fixes corrupted pixels when a Flate image with a PNG predictor is read a second time in one render, for example because the page draws it twice. It affects images above PDFium's 60 MB limit for keeping decodes, which are decoded again from the start each time they are read: the decoder now predicts the first row from zeros again, instead of from the last row it had decoded.
