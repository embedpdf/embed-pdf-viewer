---
'@embedpdf/plugin-annotation': patch
---

The `tools` setting applies its entries in order, so each tool behaves the way the list reads:

- A change reaches only the tool it names. Changing `ink` no longer changes the built-in
  highlighter, and changing `line`, `polyline` or `polygon` no longer changes the Distance,
  Calibrate, Perimeter or Area tools.
- `extends` starts from a copy of a tool listed before it, as the entries above it left it. A
  change written after it doesn't reach the copy. Naming a tool that only comes later throws an
  error that says so.
- `extends` no longer copies `meta`, so a tool you make never shows the label or icon of the tool
  it came from.
- `tools.register()` adds one more entry after the setting's. It can extend a tool registered
  before it, and the function it returns puts a tool it changed back the way it was, defaults
  included, where it used to remove the tool.
