---
'@embedpdf/engine-core': patch
---

An app that imports `@embedpdf/engine` builds with Parcel again. The check behind the development warnings read `process?.env?.NODE_ENV`, which Parcel does not replace: it took it for a use of Node's `process` and stopped the build with `Node builtin polyfill "process/" is not installed`. The check now reads `process.env.NODE_ENV` as written, the expression every bundler replaces.
