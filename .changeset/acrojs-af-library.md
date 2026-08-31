---
'@embedpdf/core-acrojs': minor
---

Complete the Acrobat AF forms support library in the scripting prelude: `AFNumber_Keystroke`, `AFPercent_Keystroke`, `AFDate_Format`/`AFDate_Keystroke`(`Ex`), `AFTime_Format`(`Ex`)/`AFTime_Keystroke`, `AFSpecial_Format`/`AFSpecial_Keystroke`, `AFRange_Validate`, `AFMergeChange`, `AFMakeNumber`, and `AFExtractNums`, with Acrobat-compatible rejection alerts, a lenient scand-style date parser, and new `h`/`hh`/`tt` 12-hour tokens in `util.printd`. Forms built with Acrobat's standard number/date/time/special formats (for example the Apryse demo form) now validate, format, and auto-calculate instead of failing on missing globals.
