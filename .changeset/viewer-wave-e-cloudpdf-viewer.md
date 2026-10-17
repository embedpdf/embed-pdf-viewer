---
'@cloudpdf/viewer': patch
---

`resolveCloudConfig` passes `docAffinityHeader` and `onRetry` to the cloud engine. Before, they fell through to the viewer, where nothing read them, so every cloud door (the snippet, `@cloudpdf/viewer-react`) dropped them.
