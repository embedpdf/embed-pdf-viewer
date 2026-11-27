---
'@embedpdf/core': minor
---

A plugin's clock says what day it is: `ctx.clock.today()` gives the host's calendar day (`CalendarDay`: `year`, `month` from 1, `day`), the device's own in its time zone unless the host clock passes `today()`. `manualClock({ today })` fixes the day for a test.

`ctx.allowsField()` and `ctx.assertAllowedField()` take a field's `assignment` beside its `groupId` (`AssignedField`), and pass both to the session's own check, which reads the assignment first: a field anyone fills in is every signer's, as the engine has it, and a refusal for one names `doc.forms.fill` (`doc.sign`), as the engine's does. A caller that passes `{ groupId }` alone is answered as before.
