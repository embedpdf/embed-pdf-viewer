---
'@embedpdf/react': minor
---

New `KernelProvider` in `@embedpdf/react/runtime`: gives a subtree a kernel that was created elsewhere, such as the full viewer's, so every hook in it reads that kernel. It never starts or destroys the kernel.

The toolbar's default "More" menu no longer lays an invisible backdrop over the whole page: it closes on a press anywhere outside it and its button.
