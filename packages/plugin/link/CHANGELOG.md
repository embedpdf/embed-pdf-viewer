# @embedpdf/plugin-link

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
