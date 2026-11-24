---
'@embedpdf/core-acrojs': minor
---

`formatDate(date, pattern)` and `parseDate(text, pattern, today)` write and read a date by a pattern (`'dd/mm/yyyy'`, `'h:MM tt'`) without running a script.

- `formatDate({ year: 2026, month: 3, day: 5 }, 'dd/mm/yyyy')` is `'05/03/2026'`. It is `util.printd`, so the text is what a field's format script writes for the same date.
- `parseDate('5/3/26', 'dd/mm/yyyy', today)` gives the date's parts, or `null`. It reads what a field's keystroke script accepts and nothing more: text the pattern can't read gives `null`, where a format script would try JavaScript's own date reading. `today` is required and gives the year and the month the text leaves out; neither function reads a clock.
- A date is its parts (`DateParts`, `DatePartsInput`), with no time zone.

The prelude installs one more internal entry beside `__acrojsRun` and `__acrojsBoot`: `__acrojsParseDate(text, pattern, today)`, the same parse with today passed in. A script cannot replace it, and what scripts do is unchanged.
