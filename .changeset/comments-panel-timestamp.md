---
'@embedpdf/viewer-chrome': patch
---

A comment and a reply show their time as well as their day, with the year once it isn't this year's, and the whole date and time in a tooltip. Dates, times and file sizes are written in the language the viewer shows, the way the reader's region writes them: an English viewer reads `14 Sept, 17:30` in a British browser and `Sep 14, 5:30 PM` in an American one, and a `locale` that names a region, such as `'en-GB'`, writes them that way for everyone. A language whose code the browser can't read is written in the browser's own formats.
