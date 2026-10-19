---
'@embedpdf/web': minor
---

Add `observeOutsidePress(element, onPress)`: calls `onPress` for a pointer press anywhere in the document outside `element`, read from the press's composed path so it works for an element inside a shadow root. `mountWebFont(key, data)` now mounts the face under the family `epdf-<key>`, so a family of the same name on the page never stands in for a registered font; the rich text editor reads that family back as the key.
