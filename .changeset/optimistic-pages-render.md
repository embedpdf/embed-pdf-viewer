---
'@embedpdf/plugin-render': patch
---

A page that shows before the engine has it (a blank insert, a deleted page an undo brings back) is drawn once the engine has it: until then nothing asks the engine for its pictures or tiles, and a page that goes before it lands rejects `not-found`. A copy shows at once, drawn as the page it copies.
