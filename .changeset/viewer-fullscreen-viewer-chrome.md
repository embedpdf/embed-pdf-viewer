---
'@embedpdf/viewer-chrome': patch
---

Full Screen (`view:fullscreen`) fills the screen with the viewer's own box instead of the whole page, and leaves the page's own full screen alone. The viewer stays where the page put it, and nothing on the page moves or changes. In a frame without `allow="fullscreen"` the button isn't there, since the browser lets nothing in such a frame go full screen. Where the browser has no full screen for elements (Safari on iPhone) or refuses it, the viewer covers the whole window instead, until the button or Escape ends it; a viewer that already is the whole window there has no Full Screen. The button follows Escape and the page's own `requestFullscreen()` on the `<embedpdf-viewer>` element, shows the `fullscreenExit` icon while the viewer fills the screen, and dialogs and sheets open in the viewer stay on top as it goes full screen.
