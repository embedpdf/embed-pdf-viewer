# @cloudpdf/web

## 3.2.0

## 3.1.0

## 3.0.0

### Minor Changes

- [#936](https://github.com/embedpdf/embed-pdf-viewer/pull/936) by [@bobsingor](https://github.com/bobsingor) – New package: the browser code of CloudPDF's plugins, as `@embedpdf/web` is EmbedPDF's. `browserProtectedPlayer()` is the protected display plugin's player in a browser: it plays the pages' DRM-protected frames in two videos through Encrypted Media Extensions and Media Source, with FairPlay in Safari and Widevine in Chrome, Edge and Firefox. Pass it as `protectedDisplayPlugin({ player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()) })`.

## 3.0.0-next.23

## 3.0.0-next.22

## 3.0.0-next.21

## 3.0.0-next.20

### Minor Changes

- [#936](https://github.com/embedpdf/embed-pdf-viewer/pull/936) by [@bobsingor](https://github.com/bobsingor) – New package: the browser code of CloudPDF's plugins, as `@embedpdf/web` is EmbedPDF's. `browserProtectedPlayer()` is the protected display plugin's player in a browser: it plays the pages' DRM-protected frames in two videos through Encrypted Media Extensions and Media Source, with FairPlay in Safari and Widevine in Chrome, Edge and Firefox. Pass it as `protectedDisplayPlugin({ player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()) })`.
