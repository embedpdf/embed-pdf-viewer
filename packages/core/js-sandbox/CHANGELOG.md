# @embedpdf/core-js-sandbox

## 3.0.0-next.11

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The `ScriptSandbox`/`ScriptSandboxFactory` structural contract moved to `@embedpdf/core-acrojs` (cycle fix); this package implements and re-exports it, and threads the new annots plane + `annotEffects` through the QuickJS bridge unchanged.

## 3.0.0-next.10

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the QuickJS-backed sandbox for PDF JavaScript. It provides deterministic, resource-bounded script execution for interactive forms without running document code directly in the host JavaScript context.
