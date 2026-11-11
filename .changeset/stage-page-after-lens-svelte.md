---
'@embedpdf/svelte': patch
---

Opening another document while one is shown in a `<Stage>`, or closing the shown one, no longer throws `Cannot read properties of null (reading 'getLensId')` (in Safari, `null is not an object (evaluating '$$props.stage.getLensId')`) and leaves the Stage blank. A page stays readable until its layers are gone: a layer that reads `usePage()` in a cleanup gets the page as it last was.
