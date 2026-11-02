---
'@embedpdf/viewer': minor
---

`appState` is a live config key: your app's state, which your commands read as `appState`. Set it with `.appState`, in `.config`, or as `ViewerConfig<AppState>`'s `appState`; a new value and every button asks its command again, in the same viewer.
