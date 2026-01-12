---
'@embedpdf/core': minor
---

Add permission override system with global and per-document configuration:

- Add `PermissionConfig` interface for configuring permission overrides with `enforceDocumentPermissions` and `overrides` options
- Add `permissions` option to `PluginRegistryConfig` for global permission configuration
- Add `permissions` to `DocumentState` for per-document permission overrides
- Add `getEffectivePermission` and `getEffectivePermissions` selectors for layered permission resolution (per-document → global → PDF)
- Add human-readable permission names (`print`, `modifyContents`, `copyContents`, etc.) as alternatives to numeric flags
- Update `BasePlugin` permission helpers (`checkPermission`, `requirePermission`, `getDocumentPermissions`) to use effective permissions
- Update `useDocumentPermissions` hooks (React, Svelte, Vue) to return both effective and raw PDF permissions
- Add `config` prop to `EmbedPDF` components for passing `PluginRegistryConfig`, deprecating individual `logger` prop
- Export `PermissionConfig`, `PermissionName`, `ALL_PERMISSION_FLAGS`, and permission selectors
