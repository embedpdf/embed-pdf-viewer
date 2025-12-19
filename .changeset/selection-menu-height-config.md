---
'@embedpdf/plugin-selection': patch
---

Added configurable `menuHeight` option to `SelectionPluginConfig`. This allows customizing the height used to determine whether the selection menu appears above or below the selection. Default value is `40` pixels. Also fixed type imports in Svelte `SelectionLayer` component.

```typescript
createPluginRegistration(SelectionPluginPackage, {
  enabled: true,
  menuHeight: 50, // Custom menu height for placement calculations
});
```
