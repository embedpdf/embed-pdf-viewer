---
'@embedpdf/plugin-annotation': minor
---

Disarming a stamp goes back to the tool that was active when it was armed: `stamps.disarm()`, and through it the stamp plugin's `disarm()` and a signature mark that goes into a field. When that tool is gone, it goes to the default tool. Before, the `stamp` tool stayed active with nothing armed, so the form layer stayed down and the next click asked for a file. A stamp stays armed while it's placed, a second arm keeps the first one's tool, and switching to another tool still disarms the stamp and keeps the tool picked.

The armed stamp's preview can show in a box a sibling plugin's click would put it in, instead of at the pointer: `hoverGhostIn({ page, box, rot })` on the host lens, `null` to give it back to the pointer, with the new `ImageGhostPlace` type. A new or dropped arm and a tool change clear it. The signature plugin uses it to show a mark in the field it goes into.
