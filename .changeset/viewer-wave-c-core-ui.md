---
'@embedpdf/core-ui': minor
---

Reads for the bars that float over the pages: `floatOf(place)` gives where a place floats, `barsFloating(data, position)` lists the bars floating at a position in the order they were added, `floatStackOf(data, position)` lists them each followed by the bars that ride along it (as `edgeStackOf` does for an edge), and `FLOAT_POSITIONS` names the eight positions. `tabsOf(data)` says when the document tabs show: the layout's `tabs`, or `'multiple'` (while more than one document is open) when it has none.

A group can be `dependent: true` (on a layout group object, on `BarGroup`, and normalized on `NormalizedGroup`): it shows only while something that isn't dependent shows in the same bar. A bar with only dependent groups left shows nothing, so `filterBar`, `hasVisibleUnits`, `projectStrip` and the toolbars built on them draw nothing for it, and `omittedCommandsOf` leaves out the tab of a mode whose bars have only dependent groups left. Menus are not affected. `validateLayout` names a `dependent` that isn't `true` or `false`, and a bar whose every group is dependent.
