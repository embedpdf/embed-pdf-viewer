---
'@embedpdf/plugin-annotation': minor
---

Disarming a stamp goes back to the tool that was active when it was armed: `stamps.disarm()`, and through it the stamp plugin's `disarm()` and a signature mark that goes into a field. When that tool is gone, it goes to the default tool. Before, the `stamp` tool stayed active with nothing armed, so the form layer stayed down and the next click asked for a file. A stamp stays armed while it's placed, a second arm keeps the first one's tool, and switching to another tool still disarms the stamp and keeps the tool picked.
