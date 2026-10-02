---
'@embedpdf/core-ui': patch
---

Add what a toolbar draws, as data, so every framework adapter shares one implementation: `layoutToolbar(input)` fits a bar and turns the fit into the parts to draw (the live row's sections and groups, the measurement layer's every variant, folded group and group trigger, each with its command resolved, its run bound and the key its width is measured under); `groupMenuView(view, isOpen, close)` is the menu a folded group or a group's trigger opens; `stripGroupsOf(bar, resolve)` and `sameStripGroups(left, right, sameCommand)` resolve and compare a strip. The views (`CollapsedGroupView`, `GroupDisclosureView`, `OverflowMenuView`, `StripView`, `StripViewGroup`, `CustomSlotCtx`) are generic over the resolved command.
