---
'@embedpdf/web': patch
---

Add the search and link layers' parts every framework adapter wrote for itself: `searchHighlightsOf(hits, options)` (each line of each match as a box or a polygon, in the active or the plain color); `linkAnchorOf(link, page, labelOf)` (a link's box, `href` and label); `linkActivateContextOf(link, page, stage)`, `sendLinkEvent(actions, link, page, event)` and `hoverLink(pump, link, page)` (what a link's anchor tells the link and actions plugins). `copySelection(selection)` takes anything with `readText()`.
