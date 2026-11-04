---
'@embedpdf/snippet': patch
---

Fix keyboard access to schema-driven dropdown menus (Zoom Menu, Document Menu, Page Settings, and any other menu rendered via `SchemaMenu`). Opening a menu previously left focus on the trigger button, so Tab-only keyboard users could not reach the menu's own items; the container div was also missing `role="menu"` even though its items already carry `role="menuitem"`. Focus now moves to the first menu item on open and returns to the trigger button on close.
