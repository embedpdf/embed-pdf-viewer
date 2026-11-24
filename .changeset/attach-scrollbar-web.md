---
'@embedpdf/web': minor
---

New `attachScrollbar(element, { bar, onDragging })`: it binds a Stage scrollbar's track element, with the thumb inside it, in one call. It takes the bar's presses on a listener of its own on the track, so a press on the bar never reaches the Stage below it in any framework. It sends each press to the thumb's drag or the track's paging, follows the moves and ends at the release. `createScrollbarPresses` stays for a bar that wires its own listeners.
