---
'@embedpdf/engine-services': patch
---

Keep the mark in a signature field fitted when the field changes. A mark, a signature's or one drawn in with `forms.setSignatureAppearance()`, is a drawing fitted into the field's box. Until now a resize stretched it to the new size and a new turn left it as it was. It is now fitted again whenever the widget's box or its turn (`rotation`) changes, the way a stamp's drawing is: by the fit it records, and a signature's by `contain`. A move alone still writes nothing but where the widget stands.
