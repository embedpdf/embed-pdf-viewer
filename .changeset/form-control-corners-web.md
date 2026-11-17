---
'@embedpdf/web': patch
---

Keep a form field's control square when the page rounds its own inputs. The form layer draws in your page, so a rule such as `input:focus-visible { border-radius: 8px }` rounded a focused text field and its focus ring, while the field in the PDF is square. Every native control the layer draws now sets its own corners: the text box, the dropdown, the list and the buttons.
