---
'@cloudpdf/server': patch
---

The font list marks the fallback fonts the server comes with (Noto Sans Hebrew and Noto Naskh Arabic) `builtIn: true`, and the fonts in `CLOUDPDF_FONTS` `builtIn: false`. Font lists get new cached URLs, so none is read without the field.
