---
'@embedpdf/plugin-annotation': patch
---

Add smart line recognition to the ink handler with horizontal/vertical axis snapping.

When `smartLineRecognition` is enabled on an ink tool, straight strokes drawn close to a horizontal or vertical axis are automatically snapped to a clean two-point line after `pointerUp`. The snapped line is centred on the average position of all recorded points rather than being anchored to the start point. Diagonal straight strokes (outside the snap cone) are left untouched with their original points intact.

New `InkBehavior` fields on `AnnotationTool`:

- `snapAngleDeg` — degrees from horizontal/vertical within which snapping is applied (default `15`). Strokes whose angle falls outside both snap zones are not reduced to two points.
