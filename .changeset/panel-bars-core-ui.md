---
'@embedpdf/core-ui': minor
---

A bar can go at the top of a panel, under its title: the place `{ panel: id }`, beside an edge, `{ float }`, `{ with }` and `{ at }`. A panel's bars stack in the order they were added. `barsInPanel(data, panel)` lists them and `panelOf(place)` reads the panel a place names, and `validateLayout()` names a panel the layout doesn't have, with the closest one that exists.
