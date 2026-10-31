---
'@embedpdf/plugin-stage': minor
---

Lock settings for one document: `stage.lockSettings({ settings, by, reasonKey? })` holds them at a value over `updateSettings()`, the responsive rules, a restored view state and `resetSettings()`, which still change the settings underneath, so the user's own choice is back when the lock goes. It returns the function that lets go; otherwise the lock lasts until the document closes. A second lock on a setting at another value is refused (`conflict`), naming the holder; at the same value both hold. `getLock(setting)` says who holds a setting and why. Every setting but `zoom` can be locked. Taken in a plugin's `connect()`, a lock holds from the Stage's first layout. `getViewState()` saves the locked settings as they are underneath the lock.
