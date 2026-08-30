# @embedpdf/plugin-stage

## 3.0.0-next.10

### Patch Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Allow `RevealOptions.rect` to be `null` and align stage coordinate conversion
  with the content-space page transform API.

## 3.0.0-next.9

## 3.0.0-next.8

### Patch Changes

- [#779](https://github.com/embedpdf/embed-pdf-viewer/pull/779) by [@bobsingor](https://github.com/bobsingor) – Keep page and scrollbar screen geometry hidden until initial viewport placement commits. Stage consumers no longer receive origin-based placeholder geometry while viewport, responsive settings, and camera state are being initialized, preventing pages from rendering at the top-left before their final placement.

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add responsive container-query settings and named active rules. Add gesture lifecycle, elastic overscroll, fling, anchored double-tap zoom, and lens identity APIs, while removing the deprecated interaction settings and moving wheel classification to `@embedpdf/web`.

### Patch Changes

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Double-tap from a pinched-in zoom returns to fit-width instead of climbing (the iOS rule). The zoom ladder previously picked "the first posture meaningfully above the current zoom," so a pinch to a level between fit-width and detail made a double-tap zoom IN further. The rule is now: the ladder ascends only from ON a rung (within ±10% of a posture) — a tap at a posture moves to the next, wrapping past the top — while a pinch to any other level is leaving the ladder, and a double-tap there RESETS to the base fit ("take me back to reading"), never a further zoom-in. Everything that already felt right is unchanged: zoomed-out → fit-width, fit-width → detail, detail → fit-width.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Expose transient `cameraResting` state and defer page-origin device snapping while zoom is moving. Pages retain fractional placement through continuous zoom and snap once the camera settles, preventing anchor jitter and per-step content movement without sacrificing crisp resting placement.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt document stage plugin. It combines scrolling, viewport measurement, zoom, pan, spread layouts, navigation, and coordinate conversion through pure intents and selectors built on `@embedpdf/core-stage`.
