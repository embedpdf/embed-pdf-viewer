---
'@embedpdf/plugin-stamp': patch
---

`persistStampLibraries` and `restoreStampLibraries` take only the members they use (`exportLibrary` and `onLibraryChanged`, and `importLibrary`), so a framework's own service of the plugin works as well as the capability.
