---
'@embedpdf/viewer-chrome': patch
---

The stamps, signatures, measurement and redaction panels read the plugins' state hooks (`useStampState`, `useMeasurementState`, `useRedactionState`) and arm stamps with `useStamp().armAsset()`.
