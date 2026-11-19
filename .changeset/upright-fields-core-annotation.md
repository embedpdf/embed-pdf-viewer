---
'@embedpdf/core-annotation': minor
---

Read a form widget as a turned box: its `box` is the frame its contents are laid out in and its `rotation` the quarter turn it holds (`/MK /R`), as the engine reads it. Until now a widget read as its `rect` with no turn, so a field another app turned was selected, moved and drawn as if it were upright; this is a fix, and nothing changes for a widget that isn't turned.

- A box placed by an upright tool keeps its turn for a widget, as for a stamp, so a form field placed on a page shown turned reads upright there.
- New capability flag `quarterTurns`, set on the widget kinds: `rotateSelection` by a quarter turn and `resetRotation` act on a widget, which still shows no rotation handle.
- New `orientationPatch(annotation, rotation)`: the `box` and `rotation` that turn a widget's contents where it stands, and the `orientation` choice `selectionProperties` lists for a selection of widgets.
- New `placedBoxFields(placement)` and `standingRect(box, degrees)`.
- A box's `rect` at a quarter turn is exact: its sides swapped, with no rounding.
- A turn keeps what it turned on its page. The `rotateSelection` and `resetRotation` messages take `pageBoxes`, the box of each page by its object number (new type `PageBoxes`): where the turn would carry a selection past its page's edge, it moves the least that puts it back on the page, as a move keeps it there. Without `pageBoxes` a turn is what it was.
