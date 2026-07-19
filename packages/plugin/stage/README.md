# @embedpdf/plugin-stage

The Stage is the viewer's coordinate system: it lays pages out into a scene,
points a camera at them, and turns every scroll, zoom, resize, and "go to page 5"
into one camera move. Everything you see is the camera; everything you configure
is a policy about how the camera is allowed to move.

## The camera: one mental model

**Every camera move is defined by what it holds fixed.** There are five kinds of
move, and each one keeps exactly one thing still:

| You do…                                            | What stays fixed               | Controlled by                 |
| -------------------------------------------------- | ------------------------------ | ----------------------------- |
| drag, pinch, ctrl+wheel                            | the content under your pointer | nothing — that's physics      |
| click zoom in/out, `zoomTo`, switch to fit-width   | a focal point in the viewport  | **`zoomAlign`**               |
| resize the container, rotate a page, change spread | the spot you were looking at   | **`anchorAlign`**             |
| `goToPage`, next/prev, reset                       | nothing — a fresh landing      | **`arrivalAlign`**            |
| click an outline entry, a search hit, a PDF link   | whatever the call specifies    | the call itself, per-`reveal` |

One more setting stands outside the table. When an axis of content **fits** the
viewport, the camera has no freedom on that axis — there is nowhere to scroll.
**`fitAlign`** says where content rests in that case (default: centered). It is a
standing constraint applied to _every_ move above, not a move of its own.

All four settings speak the same per-axis vocabulary, and `x`/`y` are independent:

```ts
stagePlugin({
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
  fitAlign: { x: 'center', y: 'center' },
});
```

(The values above are the defaults — a document-reading feel. If that's what you
want, configure nothing.)

## `arrivalAlign` — where navigation lands

When you _navigate_ (`goToPage`, `next`, `prev`, reset), the target page lands at
the same place **at every zoom level** — landing is a policy, never a side effect
of how zoomed in you happen to be. Per axis:

| Value      | Landing                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `'start'`  | reading edge flush with the viewport edge (top / reading-start) — default |
| `'center'` | page centered — the presentation feel                                     |
| `'end'`    | far edge flush                                                            |
| `0`–`1`    | page center at this viewport fraction (`0.35` ≈ a browser find-bar)       |
| `'keep'`   | this axis doesn't move at all                                             |

Landings clamp against the document edges, so they are best-effort on the first
and last pages — exactly like a browser.

One value deserves a second look: **`x: 'keep'`** — page forward without losing
your horizontal position. Zoomed into the left column of a two-column paper,
`next()` takes you to the left column of the next page. (It's the PDF
`/XYZ null` semantic, as a default.)

Any single navigation can override the setting:

```ts
stage.goToPage(12, { arrivalAlign: { y: 'center' } });
```

## `zoomAlign` — what focal-less zoom zooms around

Pinch and ctrl+wheel always zoom around the pointer — that is not configurable,
because anything else feels broken. `zoomAlign` answers the remaining case:
zooming with **no pointer position** — toolbar buttons, keyboard shortcuts,
`zoomTo`, switching between fit modes.

Default `{ x: 'center', y: 'center' }`: the middle of what you see stays put and
the view inflates around it. Set `y: 'start'` for top-stable zoom — the first
visible line holds still while everything grows below it (the text-editor feel).
Values: `'start' | 'center' | 'end' |` fraction.

## `anchorAlign` — what survives a reframe

When the world reshapes under a passive camera — the container resizes, a page is
rotated or deleted, the gap or spread changes — the Stage keeps you looking at
what you were looking at. `anchorAlign` says **where in the viewport** that
reference point lives: it is captured there before the change and restored there
after.

Default `{ x: 'start', y: 'start' }` — the browser scroll model: the top of what
you see is pinned, and growth or shrinkage happens below. This is why a container
that mounts small and then expands doesn't shove the document downward: the top
stays where it was and the extra height reveals more page.

Set `{ x: 'center', y: 'center' }` for canvas-style reframes: the middle is
pinned and resizes balloon symmetrically (the Figma feel).

## `viewRotation` — rotate the view, not the document

Adobe's "Rotate View": a quarter-turn applied to how **every page displays in
this lens**, on top of each page's own `/Rotate`.

```ts
stage.rotateView(90); // toolbar verb: one quarter-turn clockwise from here
stage.setViewRotation(180); // absolute
stage.viewRotation(); // 0 | 90 | 180 | 270
stagePlugin({ viewRotation: 90 }); // or start rotated
```

Three properties define it:

- **Non-persistent.** Nothing is written to the PDF — no engine call, no
  registry revision. Saving the document saves what was loaded. The permanent
  per-page rotation is `plugin-page-edit`'s `rotateBy`/`setRotation`; keep the
  two on different buttons.
- **Per lens.** It is a `StageSettings` field like `zoom` or `layout`, so the
  main viewer rotates while a thumbnail lens stays upright — or share one
  setting across lenses if your product wants them to agree.
- **A reframe.** Changing it holds the `anchorAlign` point like any other
  scene change (the "rotate a page" row in the table above), and fit-modes
  re-resolve against the swapped footprint.

Annotation tools that place content with a reading orientation (stamp,
free-text) counter-rotate against the **total** display rotation — `/Rotate` +
`viewRotation` — via their `upright` option, so what the author places reads
horizontally exactly as they see it.

## Recipes

**Document reading** — the defaults. Configure nothing.

**Presentation / construction sheets** — every move keeps the current sheet
centered; each arrival presents the sheet like a slide:

```ts
stagePlugin({
  arrivalAlign: { x: 'center', y: 'center' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'center', y: 'center' },
});
```

**Zoomed-in reading of scanned two-column papers** — hold the column while
paging, land a comfortable third from the top:

```ts
stagePlugin({ arrivalAlign: { x: 'keep', y: 0.35 } });
```

A "preset" is just an object you keep and pass — to `stagePlugin()` at setup or
`stage.update()` at runtime. The plugin ships no named presets; that taxonomy
belongs to your product.

## The scroller contract — scrollbars, minimaps, "% read"

The Stage doubles as a **virtual scroll element**. `scrollMetrics()` projects
the camera into the native DOM vocabulary — every field means exactly what it
means on a `<div>`, in screen px:

```ts
const m = stage.scrollMetrics();
// m.scrollTop / m.scrollLeft       — where you are
// m.scrollHeight / m.scrollWidth   — how much there is
// m.clientHeight / m.clientWidth   — how much you see
// m.scrollableY / m.scrollableX    — false = nothing to scroll (hide the bar)

stage.scrollTo({ top: 0 }); // Element.scrollTo semantics
stage.scrollBy({ top: m.clientHeight * 0.9 }); // page down
```

That is the whole contract. A scrollbar thumb is
`clientHeight / scrollHeight` of the track, positioned at
`scrollTop / scrollHeight`; a reading-progress indicator is
`scrollTop / (scrollHeight − clientHeight)`; a minimap is the same numbers
drawn small. You never touch camera math.

The metrics are derived from the **same travel range the pan clamp uses**, so
a scrollbar can never disagree with where panning actually stops:

- **Zoom** reshapes the range live — zoom in and the thumb shrinks, exactly
  like a longer document.
- **Paged flow** scrolls the current item: the bar reflects one page (or
  spread), and hides when it fits.
- **A fitting axis** reports `scrollable: false` with `scrollWidth ===
clientWidth` — the native "no bar" condition, for free.
- **RTL** stays physical: `scrollLeft` is the offset from the range's left
  edge, deliberately sidestepping the DOM's negative-`scrollLeft` behavior.

**Unbounded stages get the Figma scrollbar.** With `bounded: false` the range
is the union of the content and your current view: pan off into empty canvas
and `scrollHeight` grows, the thumb shrinking toward the edge — but dragging
it to the other end always rides you back across the content. When everything
is in view, both axes report unscrollable and the bars disappear.

`scrollTo`/`scrollBy` default to `behavior: 'instant'` (the DOM's `'auto'`);
pass `'smooth'` for the camera tween. The `scrollBehavior` _setting_ is not
consulted — it governs navigation verbs (`goToPage`, `next`), not scrolling.

## What these settings never touch

- **Gestures.** Pan and pinch hold the pointer. Physics, not policy.
- **Explicit arrivals.** `reveal(page, { rect, zoom, anchor })` — search hits,
  outline clicks, PDF destinations — carries its own anchor and always beats the
  settings. Bare `reveal(page)` stays minimal-movement: it scrolls only as far as
  needed to make the page visible, and not a pixel further.
- **Saved viewpoints.** `goToPage(i, { viewpoint })` restores exactly what was
  captured.
