---
'@embedpdf/plugin-ui': minor
---

Added `data-hidden-items` attribute for efficient CSS dependency rules.

**Problem**: Visibility dependency rules (e.g., hiding overflow buttons when all menu items are hidden) required exponential CSS rules when using category-based logic, causing stylesheet bloat.

**Solution**:

- Added `hiddenItems` state that tracks which item IDs are hidden based on disabled categories
- Dependency rules now use `data-epdf-hid` attribute to check item IDs directly
- CSS rules are now O(n) per breakpoint instead of O(m^n)

**New APIs**:

- `getHiddenItems()` - returns array of hidden item IDs
- `onCategoryChanged` event now includes `hiddenItems` in payload
- `extractItemCategories(schema)` - extracts item→categories mapping
- `computeHiddenItems(itemCategories, disabledCategories)` - computes hidden items

**Breaking Changes**: None - existing `disabledCategories` API unchanged
