---
'@embedpdf/engine-core': minor
---

Page pictures come in four families, by what they draw beside the page content: nothing, the annotations, the form fields, or both. `PAGE_RENDER_FAMILIES` is the one table of what each draws, needs, depends on, pins and where its path is. `render/annotated/` is renamed `render/all/` and now draws form fields too, and `render/annotations/` and `render/fields/` are new.

- **Paths:** `wirePaths.docPageRender`, `layerPageRender` and their `…Current` twins take the family.
- **Resources:** `page-render-annotations`, `page-render-fields` and `page-render-all`, with their `layer-` twins, replace `page-render-annotated`, and CDN coverage grants each by its own rights and planes.
- **Tokens:** a picture's token carries its family's pins, `widgetVersion` included, and `PageRenderQuerySchemas` holds one schema per family.
- **Codec:** `pageRenderOptionsFromImageOptions` takes what to draw from the parsed options.
- **Types:** `PageRenderLayers` names what a picture draws.
