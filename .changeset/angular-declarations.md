---
'@embedpdf/angular': patch
---

The type declarations are complete for an app that compiles against the built package.

- Every service built with `pluginService()` (`EpdfDocuments`, `EpdfSearch`, `EpdfForm`, …) has
  its methods, signals and streams in the declarations. A service's base class is now named,
  `PluginServiceClass<SearchCapability, …>`, and the app's compiler works out each member from
  the plugin's types, so the declarations no longer import packages `@embedpdf/angular` doesn't
  depend on (`@embedpdf/engine-core`, `@embedpdf/core-acrojs`).
- No entry point's declarations import the entry point itself by its public name
  (`@embedpdf/angular/runtime` inside the runtime entry point, `@embedpdf/angular/stage` inside
  the stage one).
- New type: `PluginServiceClass`, what `pluginService()` returns.
