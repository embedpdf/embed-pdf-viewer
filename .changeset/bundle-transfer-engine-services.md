---
'@embedpdf/engine-services': minor
---

A bundle's export and import pieces are shared by every family: the page table (`bundlePagesOf`), the resources kept once by hash (`BundleResources`), and the check of a received bundle (`checkWireBundle`, `assertImageWithinLimit`). The annotation exporter and importer use them; their bundles are unchanged.
