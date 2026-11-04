---
'@embedpdf/plugin-tiling': patch
---

Fix duplicate tile ids emitted by the UPDATE_VISIBLE_TILES reducer when the scale changes while fallback tiles from an earlier generation are still present. Tile ids encode page/scale/rect but not rotation, so rotating 90° → 270° under a fit zoom mode revisits an earlier scale and re-generates identical ids; the scale-change branch concatenated carried and fresh tiles without deduplication. Keyed renderers crash on the duplicates — in Svelte this throws `each_key_duplicate` mid-flush and can wedge the tab.
