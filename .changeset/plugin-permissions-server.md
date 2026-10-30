---
'@cloudpdf/server': minor
---

Add `PermissionRegistry`, the plugin permissions a server's installed plugins declare, and `buildApp({ permissions })` to pass it. Issuing a token or saving a grant that names a plugin permission no installed plugin declares is refused with `InvalidArg`. `/access` puts the installed plugin permissions a token holds (every one under `*`) into `effectiveScope`; a plugin permission whose plugin isn't installed is carried by the token but takes no effect. The app bundle also lists the routes it mounted (`routes`).
