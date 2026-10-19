---
'@embedpdf/engine-core': minor
---

What every bundle shares is its own module, ready for a second family: `BundlePage`, `BundleImportPages`, `BundleImportTarget`, `BundleKind`, `resourceIdOf` and `bundlePageMapping`; the limits are `BundleLimits` and `DEFAULT_BUNDLE_LIMITS`, and their messages name the bundle's kind; `bundleCodec()` makes a family's JSON file (`AnnotationTransfer` is one), with `BundleTransferOptions`. Renamed: `AnnotationBundleLimits` → `BundleLimits`, `DEFAULT_ANNOTATION_BUNDLE_LIMITS` → `DEFAULT_BUNDLE_LIMITS`, `AnnotationBundlePage` → `BundlePage`, `AnnotationImportPages` → `BundleImportPages`, `AnnotationImportTarget` → `BundleImportTarget`, `assertBundleManifest` → `assertAnnotationBundleManifest`, `AnnotationTransferOptions` → `BundleTransferOptions`; the access response's `annotationBundleLimits` is `bundleLimits` (`BundleLimitsSchema`). Annotation bundles, their files and their messages are unchanged.
