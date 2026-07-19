# Annotation spike

A minimal, **engine-free** spike of the v3 annotation architecture. The "page" is
a blank rectangle so the concept stays in focus:

- **Pure core** (`src/core/`) — `update(model, msg) → [model, effects]` and
  `view(model) → RenderNode[]`. No DOM, no engine, no framework. This is the part
  that transliterates to Rust/Crux later.
- **Dumb renderer** (`src/react/SceneSvg.tsx`) — paints `RenderNode[]`, zero logic,
  zero event handlers.
- **One pointer listener** (`src/react/Surface.tsx`) — converts events to page
  space and feeds the core. Nothing else listens for events.

## What it demonstrates

- `square` + `circle` creation tools (drag to create)
- a default `select` tool that branches on what's under the pointer:
  click body → **move**, corner → **resize**, knob → **rotate**, empty → **marquee**
- multi-selection (`⇧`-click or marquee) with a group bounding box
- a floating menu: **rotate 90°** (works on a group, about its center) and **delete**
- a **zoom** slider — note the shapes scale but the handles stay a fixed pixel size,
  because the whole transform is a single `Mat2D`

Geometry is uniform: every annotation is a **unit shape + a `Mat2D`**. Move/resize/
rotate are just matrix multiplications (`src/core/update.ts`).

## Run

```bash
pnpm install                # from the repo root (needs Node 18+ for Vite 6)
pnpm --filter @embedpdf/example-annotation-spike dev      # http://localhost:5200
pnpm --filter @embedpdf/example-annotation-spike test     # pure-core tests, no DOM
```
