---
'@embedpdf/core': patch
---

Add what every framework adapter's plugin API shares. `standInFor(kernel, token)` is what a document plugin's API reaches while there is no ready document: reading a member never throws, a call refuses with `not-ready`, and the settings calls work. `isReadMember(name)` says whether a member is a read (`get*`, `list*`, `is*`, `has*`, `can*`), which every adapter tracks in templates and derived values.

`createCapabilityToken` takes `promises`, the members that return a promise (`setValue`, `comments.reply`); the type asks for every one of them. Without a document, the stand-in returns a rejected promise with `not-ready` from those members, so `.catch()` sees the refusal, and throws from the others; `returnsPromise(token, path)` answers from the token.

Add `viewerSettingsOf({ identity, scope, accent, page })`, the viewer's settings as a framework's viewer takes them (a setting left out is its default), `VIEWER_WHOLE_SETTINGS`, and `mergeSettings(settings, changes, whole)`, the merge every settings store applies.
