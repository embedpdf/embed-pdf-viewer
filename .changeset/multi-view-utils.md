---
'@embedpdf/utils': minor
---

## Multi-Document Support

Added utilities for selection menu positioning and context handling.

### New Features

- **SelectionMenuPlacement**: New interface for placement hints when positioning selection menus (suggestTop, spaceAbove, spaceBelow).

- **SelectionMenuContextBase**: Base context type that all layer contexts must extend, providing a discriminated union pattern for menu contexts.

- **Selection Menu Utilities**: New selection menu utilities exported from the main utils package.
