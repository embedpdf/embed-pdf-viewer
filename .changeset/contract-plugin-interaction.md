---
'@embedpdf/plugin-interaction': minor
---

Rewritten on the kernel's `create()` controller hook with a public contract (`/contract`) and a host lens (`/contract/host`). Public: `getActiveTool`, `getActiveToolId`, `getDefaultToolId`, `listTools`, `getTool`, `hasTool`, `activeToolEnables`, `activateTool`, `activateDefaultTool`, `pushTool`/`popTool`, `setToolCursor`, `registerTool(tool, { replace })`, and the `onToolChanged` event hook. Host (`InteractionHostCapability`): `dispatchPointer` (was `dispatch`), `wouldClaimTouch`, `registerHandler`, `claimCursor` (was `setCursor`), `getCursor`. Removed: `activeTool()`, `activeToolId()`, `tools()`, `cursor()`, `onToolChange`.
