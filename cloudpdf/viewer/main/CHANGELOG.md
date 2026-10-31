# @cloudpdf/viewer

## 3.0.0-next.20

## 3.0.0-next.19

### Minor Changes

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – A document from a grant is `src: { grant, passphrase, restart }`; `password`
  stays the PDF's own. The exchange helpers are `exchangeGrant`,
  `grantSessionSource` and `GrantExchangeError`.

## 3.0.0-next.18

### Patch Changes

- [#909](https://github.com/embedpdf/embed-pdf-viewer/pull/909) by [@bobsingor](https://github.com/bobsingor) – The viewer takes `identity` again: who your page knows the user is. A document token decides for itself, and a share link takes it as the visitor's answers to what the link asks, so the questions it covers aren't asked. `src.visitor` is gone; `scope` stays out, since the token says what the user may do.

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A share link source takes `restart` (`src: { shareToken, restart: true }`) to start over on a link that keeps each visitor's layer.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – `src: { shareToken, visitor }` passes the visitor's answers to what a share link asks, when your page already has them. Without them, the viewer asks.

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The CloudPDF viewer is the open-source viewer with the cloud engine as its default, as `@embedpdf/viewer` is the same viewer with the built-in one. Importing it registers the cloud engine on `<embedpdf-viewer>`, so plain HTML uses the same element (a cloud document is given from script: `viewer.src = { shareToken }`), and `CloudPDF.init()` is the same function as `EmbedPDF.init()`. The engine's settings go under `engine`, `engine: { baseUrl, token, fetch }`, with CloudPDF SaaS when there's no `baseUrl` (they were top-level keys, and `baseUrl` was required). `.` is the door for a bundler, sharing `@embedpdf/viewer/core` with the app; `./snippet` is `dist/cloudpdf.js`. `./config` and `resolveCloudConfig` are gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `@cloudpdf/viewer` exports its own `ViewerConfig` type: every key of the viewer's config, with the engine and documents in the cloud's words, and without `scope` and `identity`, which the document's token carries. `CloudInitOptions` is that config plus `target`. The live keys (`theme`, `locale`, `disable`, `readOnly`) work as on `@embedpdf/viewer`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The document is `src`, in the ways the engine opens one: `{ token }` with a document token from your backend (a string, or a function that gives a fresh one), `{ id }` with the engine's token, or `{ shareToken, sharePassword }` with a share link. `src` follows its prop: another one opens in its place, and `null` closes it. `documents` takes entries of `{ src, name, password, active }` with the same `src`. The `DocumentSrc` and `DocumentEntry` types are exported. The `docToken`, `docId`, `shareToken` and `sharePassword` keys are gone, and so are the `CloudShareSource` and `CloudInitialDocument` types.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The engine stamp libraries open in is `plugins.stamp.assetEngine`, as in the open-source viewer, and still defaults to a local engine loaded on first use; `resolveCloudConfig` returns it in `plugins`. The `stamps` key is gone.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The built-in stamps load in the cloud viewer. The Stamps panel used to show "The built-in stamps could not be loaded." because a stamp library is a PDF that has to be opened in the browser, and the viewer had no local engine for it. `resolveCloudConfig` now gives `stamps.assetEngine` a local engine that is imported the first time someone opens Stamps or Signatures, never at startup. The CDN folder ships `embedpdf.wasm` next to `cloudpdf.js` for it; npm installs leave `@embedpdf/engine` to your bundler. Pass your own `stamps.assetEngine` to replace it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Adapt the CloudPDF viewer entry point to the revised engine and plugin
  configuration so cloud-backed viewers use the updated document API.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `resolveCloudConfig` passes `docAffinityHeader` and `onRetry` to the cloud engine. Before, they fell through to the viewer, where nothing read them, so every cloud door (the snippet, `@cloudpdf/viewer-react`) dropped them.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

### Patch Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The `cloudpdf.js` artifact carries the built-in stamp library as lazy sibling chunks in its own folder instead of inlining eight locale PDFs as base64. Nothing is fetched from a third party; set `stamps.defaultLibrary` to self-host or disable it.

## 3.0.0-next.11

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Minor Changes

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – Share sources pass through to the engine; the viewer-only share vocabulary is retired.
  - `{ kind: 'share' }` is a standard `OpenInput` kind now, resolved by `engine.open()` itself — `resolveCloudConfig` no longer lowers share entries into token sources, and no longer re-threads `baseUrl`/`fetch` into the exchange.
  - BREAKING (prerelease line): on share sources the grant passphrase field is `sharePassword` (was `password`, which now means the PDF's own encryption password — the same slot every other kind uses). The top-level `shareToken`/`sharePassword` shorthands are unchanged.
  - `CloudShareSource` and `CloudInitialDocument` remain as deprecated aliases of `OpenInputShare` and `InitialDocument`.

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Accepts public share tokens, so a viewer can be embedded with a dashboard-generated snippet and no backend.
  - Adds the `shareToken` and `sharePassword` options for opening a single shared document.
  - Adds a cloud `{ kind: 'share' }` document source for `documents`, so a multi-tab viewer can mix share tokens, document tokens, and document ids. Each entry exchanges and renews independently, and revoking one share leaves the others untouched. The source is lowered to an ordinary token source before the engine-agnostic viewer core sees it.
  - Re-exports `exchangeShareToken`, `shareSessionSource`, and `ShareExchangeError` so CDN-only consumers can build custom flows, such as prompting for a passphrase before mounting.

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete EmbedPDF viewer preconfigured for CloudPDF. It ships as a single CDN-ready `cloudpdf.js` artifact with no browser-side WASM or workers because document processing happens on the CloudPDF server.
