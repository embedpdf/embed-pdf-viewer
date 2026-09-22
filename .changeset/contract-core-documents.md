---
'@embedpdf/core': minor
---

`documents` follows the contract dictionary: `getActiveId`/`getActive` (was `activeId`/`active`), `list()` returns a readonly array, new `getCount`, `getOrder`/`setOrder`, `retry(id)` for a failed open, `rename`, and `save`/`saveLayer` (was `download`/`downloadLayer`) taking `OperationOptions`. Lifecycle is observable through kernel event hooks: `onOpened`, `onOpenFailed`, `onLocked`, `onClosed`, `onActiveChanged`, `onPagesChanged`. `DocInfo.error` is a `PluginErrorInfo`. `isDev()` no longer needs Node's ambient types. New `BatchResult<T, R>` — the outcome shape of every best-effort batch (`applied`, `skipped`, `failed`).
