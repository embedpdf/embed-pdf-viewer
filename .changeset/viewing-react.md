---
'@embedpdf/react': minor
---

The Stage has the four hooks every plugin has: `useStage()` (the API), `useStageState(select?, token?)` (the declared state, empty without a document), `useStageEvent()` and `useStageSettings(select?, token?)` (the view's settings). `useZoom`, `usePages`, `useLayout` and the Stage's `usePageList` are gone: read the state from `useStageState()`, change settings with `useStage().updateSettings()`, and get the pages from `usePageList()` in `/runtime`. `<Stage>` loses its `interaction`, `panFallback` and `zoomGestures` props, which are now the view's settings. `<Scrollbar>` and `useScrollMetrics()` come from `/stage` (the `/scrollbar` entry is gone); `useScrollMetrics()` reads zero without a document.

`<PageView>` takes `page` (a ref or an index, was `pageRef`/`pageIndex`), `className`, and a `pageFrame` that names only the sides it reserves. `useRenderSettings()` reads the render settings, and `RenderLayer` follows them live. `<LinkLayer renderLink>` receives `{ link, native }` (was `{ item, nativeComponent }`); every click and key follows a link through `activate()`, so `onActivated` fires for a website too, and while a `LinkLayer` or `useLink()` is mounted, `activate()` from code opens a website. `openLinkTarget` is gone.
