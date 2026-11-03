---
'@embedpdf/viewer': minor
---

The page number floating over the pages has previous and next page buttons around it, reads "3 / 12", and draws nothing for a document of one page. With pages side by side it reads "2–3 / 12" while the spread fits across the view, and Next goes to the next spread; zoomed in past it, it names the one page, and Next goes to the page beside it. It fades out once the pages and the pointer have been still for two seconds, at every size, and comes back when they move or the keyboard reaches it; a floating bar of yours does the same with `hideWhenIdle: true` in its place, which replaces `hideWhileScrolling`. Floating bars have the theme's corners instead of round ones.
