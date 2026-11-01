# @cloudpdf/protected-display

Screenshot protection for the CloudPDF viewer. For a user who may see a document's pages as
protected video (`protected-display.view`) but not render them (no `doc.render`), the plugin shows
each page as a DRM-protected video frame from the protected display server module: a screenshot,
a screen recording or a shared screen shows the page black. Selection, search, annotations and
form fields stay the viewer's, on top.

The CloudPDF viewer (`@cloudpdf/viewer`) includes it. In a headless viewer, add it with a player:

```ts
import { protectedDisplayPlugin } from '@cloudpdf/protected-display';

const plugins = [
  /* the render and stage plugins, … */
  protectedDisplayPlugin({
    player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()),
  }),
];
```

The plugin is DOM-free: it decides what shows and speaks to the server, and the player plays the
frames. In a browser that's `browserProtectedPlayer()` from `@cloudpdf/web`, which loads only for
a protected user. It does nothing on the local engine or for a user who may render pages. Docs:
https://www.cloudpdf.com/docs/viewer/features/screenshot-protection

Apache-2.0. The server module that makes the frames and proxies the licenses is CloudPDF's own.
