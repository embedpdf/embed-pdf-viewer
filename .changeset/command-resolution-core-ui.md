---
'@embedpdf/core-ui': minor
---

`omittedCommandsOf(data, resolve, menuTarget)` takes which menu each button opens as its own
argument, as `layoutToolbar` does (the commands' `getMenuTarget`, or `getCommand`), so `resolve` is
asked only whether a command shows, and only for the commands that decide it. Without
`menuTarget`, `resolve` says which menu a button opens, as before.
