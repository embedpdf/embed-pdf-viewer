---
'@embedpdf/web': minor
---

Add what every framework's `<FormLayer>` shares to draw a form field with a control of the app's own: `fieldControlFor()` picks the first control that matches a box, `fieldControlPlaceOf()` gives the frame the control draws into (the field's size at 100%, its turn on screen, the zoom) and where the layer's own drawing goes inside it, `createFieldControlPress()` runs the field's action after a value the control wrote, and `runsActionOnClick()`, `claimClick()` and `isClickClaimed()` decide which click runs it. `bindFieldFocus()` takes `custom: true` for a box that holds such a control: the cursor goes to the first element inside it that Tab stops at. Without that option it does what it did.
