---
'@embedpdf/engine-services': minor
---

`color: null` on a square, circle, polygon, polyline, line or ink is written as `/C []`, the empty color ISO 32000 defines as no color. A shape whose `/C` is empty or left out reads `color: null`, where it read red before.
