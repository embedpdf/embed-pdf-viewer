# @cloudpdf/web

Framework-free browser code for CloudPDF's plugins: the one home in the CloudPDF tree for code
that touches the DOM, as `@embedpdf/web` is for EmbedPDF's. The plugins themselves stay DOM-free
and take what they need from the host through a port.

## The protected display player

`browserProtectedPlayer()` plays the frames of `@cloudpdf/protected-display`: the page as
DRM-protected video, in two videos with the keys of one viewing session, through Encrypted Media
Extensions and Media Source. FairPlay in Safari, Widevine in Chrome, Edge and Firefox.

```ts
import { protectedDisplayPlugin } from '@cloudpdf/protected-display';

protectedDisplayPlugin({
  // Loaded only for a user who sees the pages as protected video.
  player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()),
});
```

The plugin decides which DRM system plays, which frames show and where they sit, and speaks to the
server; the player plays what it's given. The CloudPDF viewer (`@cloudpdf/viewer`) wires this up.
Docs: https://www.cloudpdf.com/docs/viewer/features/screenshot-protection

Apache-2.0.
