/**
 * What a shape family is: everything the core does with one kind of shape.
 * Each family file (`box.ts`, `points.ts`, `text-box.ts`, `caret.ts`,
 * `quads.ts`) ends with one {@link ShapeFamily}, every kind names its family
 * (`kinds/`), and `familyOf` finds the family of any shape. The compiler
 * checks that a family answers every question, so a new family is one file.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { Border, FieldValues, Handle, ModelGeometry, Point, Rect, RenderNode } from '../types';

/** A box's four corners as the page shows them: nw, ne, se, sw. */
export type Corners = [Point, Point, Point, Point];

export interface ShapeFamily<S extends ModelGeometry = ModelGeometry> {
  /* ── reading and writing: the shape is engine fields ─────────────────── */

  /** The shape, read off an annotation of a kind in this family. */
  read(annotation: AnnotationDTO): S;
  /** The engine fields that state `shape` on an annotation of `subtype`. */
  write(shape: S, subtype: string): FieldValues;

  /* ── where it is ─────────────────────────────────────────────────────── */

  /** The box around its box or points, the stroke left out. */
  bounds(shape: S): Rect;
  /** The box around all it draws (the stroke, endings, a cloud's bumps): the engine's `rect`. */
  drawnBounds(shape: S, strokeWidth: number, border?: Border): Rect;
  /** The box a selection wraps: where its handles sit, and where a selected shape is grabbed. */
  selectionBounds(shape: S, strokeWidth: number, border?: Border): Rect;
  /** Does the shape have a turned box of its own, which a selection outlines turned? */
  oriented(shape: S): boolean;
  /** That turned box's corners, or `null` when the shape has none. */
  turnedCorners(shape: S, strokeWidth: number, border?: Border): Corners | null;
  /** Where a turn of the shape pivots, as the engine turns it. */
  pivot(shape: S): Point;

  /* ── what gestures do to it ──────────────────────────────────────────── */

  /** The shape moved by `delta`. */
  translate(shape: S, delta: Point): S;
  /** The shape turned `degrees` clockwise about `pivot`; unchanged when it doesn't turn. */
  rotateAbout(shape: S, pivot: Point, degrees: number): S;
  /** The shape scaled about `anchor` by `(sx, sy)` (a multi-selection's resize). */
  scaleAbout(shape: S, anchor: Point, sx: number, sy: number): S;
  /** The shape with its turn cleared, turned back about `pivot` where that matters. */
  upright(shape: S, pivot?: Point): S;
  /** Its handles: resize corners and sides, or vertices. */
  handles(shape: S): Handle[];
  /** The shape with `handle` dragged to `to`. */
  drag(shape: S, handle: string, to: Point): S;

  /* ── hitting and drawing ─────────────────────────────────────────────── */

  /**
   * Is `point` on the shape: within `margin` of what it strokes, or inside it
   * when `filled`?
   */
  hit(
    shape: S,
    point: Point,
    margin: number,
    filled: boolean,
    strokeWidth: number,
    border?: Border,
  ): boolean;
  /** What it draws, for the live (vector) view. */
  scene(shape: S, strokeWidth: number, border?: Border): RenderNode[];
}
