---
'@embedpdf/engine-services': patch
---

Keeps up to 128 MB of decoded images between read-only jobs (`decodedImageBudgetBytes` on the worker host), so tiles of image-heavy pages no longer decode the same images again. Any other job empties the store before it runs, and output stays byte-identical. On a plan drawn as one 35-megapixel JPEG, ten zoomed tiles take 21 ms instead of 490 ms.
