# @embedpdf/plugin-link

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A link's `id` is `annotationKey(ref)`, the same key the annotation plugin gives its record, for links stored inline as well as those with an object number.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The link contract, on the kernel's `create()` hook. `Link` is the clickable area (page-space `bounds`, was `rect`) with its target and annotation. Public: `listLinks` (was `linksOn`, reference-stable per page), new `getLink`, `getLinkAt`, `listAllLinks`, `ensureLoaded` (was `ensurePage`, now a promise), `isLoaded`, `resolve` (what activation would do, no side effect), `activate` (also accepts a `Link`), new `activateAt`, `getLabel`; events `onActivated` (replaces the `onActivate` config callback, so `linkPlugin()` takes no config) and `onLoaded`. Host (`/contract/host`): `isNavigationEngaged` (was `engaged`). The stand-alone source (no annotation plugin) re-reads a loaded page when an annotation on it changes.
  - Internal layout: `contract` / `host-contract` / `model` / `token` around the controller (no `types.ts` / `reducer.ts`).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `linksOn(page)` and `ensurePage(page)` take a `PageRef`; the activation context and link destinations carry `page`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `activate()` now opens a website itself, in the user's gesture, through the opener a framework binding registers on the host lens (`registerUriOpener`); an address it won't open (`javascript:`, `file:`) activates as `reported`. A page destination moves the view the link was followed in (`activate(link, { stage })`), by that view's `scrollBehavior` setting instead of always gliding.

  `listLinks`, `getLink`, `getLinkAt`, `ensureLoaded`, `isLoaded`, `getStatus` and `activateAt` take a page's ref or its index; a read of a page that isn't in the document is empty, and `ensureLoaded`/`activateAt` refuse it with `not-found`. `ensureLoaded` and `listAllLinks` reject `operation-cancelled` when their `signal` fires.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Link records are typed `Annotation` (was `AnnotationDTO`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Without the annotation plugin, loaded pages are re-read after a redaction or a flatten applied to them.

  Link destinations and hit areas now use durable page references and page-space geometry, including links attached to annotations.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the stage contract (`revealIndex`) and the annotation contract (`listLinkItems` from `/contract/host`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A reorder of a page's annotations (`annotations.reordered`) reads the page's links again.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Reads whether the active tool follows links through the interaction plugin's host contract, now that the public tool has no behavior tags.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `activate()` accepts an optional `LinkActivateContext`; when the actions plugin is installed and the item carries its `/A` tree, activation delegates to the dispatcher and returns the new `{ outcome: 'dispatched', dispatch }` arm — named verbs execute and mixed `/Next` chains behind links finally run. Without the actions plugin the classic root-projection path is unchanged.

  Link `/AA` hover presence flags now ride `LinkNavItem` from the standalone source so the navigation layer can deliver cursorEnter/cursorExit without waking the annotation behavior plane.

  Publish a bundle-safe `/contract` entry so navigation consumers can depend on the link protocol without pulling in source/effect/plugin wiring.

## 3.0.0-next.10

### Patch Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Mark grouped annotation link children as attached navigation items so link
  activation can defer to annotation editing instead of opening the target.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt PDF link plugin. It exposes clickable link regions and a single activation path for document destinations and external URIs while cooperating with the annotation editor when link editing is enabled.
