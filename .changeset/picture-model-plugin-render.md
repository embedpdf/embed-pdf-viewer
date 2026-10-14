---
'@embedpdf/plugin-render': minor
---

One appearance door for annotations and form widgets: `renderAppearances(page, { family, scale, items, signal })` fetches the engine's pictures of the owner's items, at rest and in every state, each tagged with the version of its item it shows. Asks for the same page, family, scale and items share one fetch, the last few sets of each page are kept, and `keptAppearances(family, item)` gives an item's last pictures after it left its page. `renderFieldAppearances` and `getFieldAppearanceEpoch` are removed: a widget's picture version is the form plugin's.
