---
'@embedpdf/plugin-stage': minor
---

`getCurrentDestination()` says where the view is as a destination: the page reaching past the top of the view, the point where `goToDestination()` puts one (a padding in from the top-left), and no zoom, so going there again keeps the reader's zoom.
