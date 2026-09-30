---
'@embedpdf/core-annotation': minor
---

A small annotation's resize handles stand out on a frame at least twice their grab size (`ChromeGeometry.handleFrame`), so each handle and the annotation between them stay reachable and visible; a press in the middle of a tiny checkbox moves it instead of resizing it from a corner. The frame slides onto the page near an edge, the chrome draws it as a `handle-frame` node, and dragging a spread handle moves its side as far as the pointer moves, the handle staying under it. A group box's handles spread the same way. Where grab zones meet, the nearest handle wins. The rotate knob, the grab area and the menu bounds of an annotation that shows handles use the frame too, so a short line can be grabbed a little way off it. `ShapeFamily` gains `handleSpread`, and its `handles` and `drag` take the spread. `chrome`, `selectionKnob` and `selectionAnchor` take the chrome geometry instead of a knob offset.
