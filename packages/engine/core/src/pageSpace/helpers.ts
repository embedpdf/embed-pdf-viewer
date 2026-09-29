/**
 * The engine's geometry helpers, for page-space values. Each flips its
 * values top to bottom, runs the helper written for the file's coordinates
 * (y up), and flips the answer back: exact, and needing no page box, since
 * none of that math depends on where the origin is.
 */

import {
  pageAnnotationDraftOf,
  pageAnnotationPatchOf,
  pdfAnnotationDraftOf,
  pdfAnnotationOf,
  pdfAnnotationPatchOf,
} from './annotations';
import type { PageCoordinates, PdfCoordinates } from './coordinates';
import type { VisibleBoxOf } from './destinations';
import { mirroredRun } from './text';
import { pdfAppearanceTurnOf } from '../annotation/appearanceTurn';
import { pdfDrawnPointsOf } from '../annotation/drawnPoints';
import { semanticEqual } from '../annotation/appearance';
import type { AnnotationDraft, AnnotationDTO, AnnotationPatch } from '../annotation/kinds';
import {
  annotationOfResolvedDraft,
  type DraftContext,
} from '../annotation/resolve/annotationOfDraft';
import {
  pdfResolveAnnotationDraft,
  type DraftResolveOptions,
} from '../annotation/resolve/resolveAnnotationDraft';
import { pdfResolveRectCommand } from '../annotation/checkWrite';
import { applyResolvedPatch } from '../annotation/resolve/applyAnnotationPatch';
import {
  pdfResolveAnnotationPatch,
  type ResolveOptions,
} from '../annotation/resolve/resolveAnnotationPatch';
import { DRAWN_RECT_KINDS, pdfShapeForRect, shapeFieldsOf } from '../annotation/shapeForRect';
import {
  glyphLooseBounds,
  glyphLooseQuad,
  type PageGeometryRun,
} from '../dto/PageGeometrySnapshot';
import { isRotatedGeometryRun } from '../dto/PageGeometrySnapshot';
import { pdfQuadBounds } from '../geometry/convert';
import {
  mirroredPoint,
  mirroredQuad,
  mirroredRect,
  unmirroredBox,
  unmirroredPoint,
  unmirroredQuad,
  type PageBox,
  type PagePoint,
  type PageQuad,
} from '../geometry/pageSpace';
import {
  pdfPointsBounds,
  pdfPointTurned,
  pdfPointUnturned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
  type PdfPointTurn,
} from '../geometry/pointTurn';
import type { PdfRect } from '../geometry/primitives';

/** A turn in page space: degrees clockwise, as the page shows it, about `center`. */
export interface PagePointTurn {
  degrees: number;
  center: PagePoint;
}

const mirroredTurn = (turn: PagePointTurn): PdfPointTurn => ({
  degrees: turn.degrees,
  center: mirroredPoint(turn.center),
});

const unmirroredTurn = (turn: PdfPointTurn): PagePointTurn => ({
  degrees: turn.degrees,
  center: unmirroredPoint(turn.center),
});

/** The box around `points`; a zero box at the origin when there are none. */
export const pagePointsBounds = (points: readonly PagePoint[]): PageBox =>
  unmirroredBox(pdfPointsBounds(points.map(mirroredPoint)));

/** `point` turned by `turn`; a negative angle turns it back. */
export const pagePointTurned = (point: PagePoint, turn: PagePointTurn): PagePoint =>
  unmirroredPoint(pdfPointTurned(mirroredPoint(point), mirroredTurn(turn)));

/** `point` turned back by `turn`. */
export const pagePointUnturned = (point: PagePoint, turn: PagePointTurn): PagePoint =>
  unmirroredPoint(pdfPointUnturned(mirroredPoint(point), mirroredTurn(turn)));

/** The turn that draws upright `points`: `degrees` about the middle of their box. */
export const pageTurnOfUpright = (points: readonly PagePoint[], degrees: number): PagePointTurn =>
  unmirroredTurn(pdfTurnOfUpright(points.map(mirroredPoint), degrees));

/** The turn drawn `points` were made with: `degrees` about the middle of their upright box. */
export const pageTurnOfDrawn = (points: readonly PagePoint[], degrees: number): PagePointTurn =>
  unmirroredTurn(pdfTurnOfDrawn(points.map(mirroredPoint), degrees));

/** The upright box around a quad, whatever its turn or skew. */
export const pageQuadBounds = (quad: PageQuad): PageBox =>
  unmirroredBox(pdfQuadBounds(mirroredQuad(quad)));

/** A glyph's loose cell as a quad. */
export const pageGlyphLooseQuad = (
  run: PageGeometryRun<PageCoordinates>,
  index: number,
): PageQuad => unmirroredQuad(glyphLooseQuad(mirroredRun(run), index));

/** A glyph's loose cell as an upright box. */
export const pageGlyphLooseBounds = (
  run: PageGeometryRun<PageCoordinates>,
  index: number,
): PageBox => unmirroredBox(glyphLooseBounds(mirroredRun(run), index));

/**
 * The points of a line, polyline, polygon or ink as the page shows them: the
 * upright points a read gives, turned by `rotation` about the middle of their
 * box. One list for a line (its two ends) or a polygon, one per ink stroke;
 * `null` for any other kind.
 */
export function drawnPointsOf(annotation: AnnotationDTO): PagePoint[][] | null {
  const flip = (points: readonly PagePoint[]) => points.map(mirroredPoint);
  let mirrored: object;
  switch (annotation.subtype) {
    case 'line':
      mirrored = {
        subtype: 'line',
        rotation: annotation.rotation,
        linePoints: {
          start: mirroredPoint(annotation.linePoints.start),
          end: mirroredPoint(annotation.linePoints.end),
        },
      };
      break;
    case 'polyline':
    case 'polygon':
      mirrored = {
        subtype: annotation.subtype,
        rotation: annotation.rotation,
        vertices: flip(annotation.vertices),
      };
      break;
    case 'ink':
      mirrored = {
        subtype: 'ink',
        rotation: annotation.rotation,
        inkList: annotation.inkList.map(flip),
      };
      break;
    default:
      return null;
  }
  const sets = pdfDrawnPointsOf(mirrored as AnnotationDTO<PdfCoordinates>);
  return sets && sets.map((set) => set.map(unmirroredPoint));
}

/**
 * The turn an annotation's appearance raster is drawn without, degrees
 * clockwise, or `null` when the raster is drawn as the page shows it. A box
 * kind drawn turned whose drawing stays inside the turned box (its `rect` is
 * the upright box around it) renders upright over its `box`, for the
 * consumer to turn about the middle of `box`: a new turn needs no new
 * raster. A callout (its line isn't turned) and a drawing that reaches past
 * its box (a cloudy border's bumps) render as the page shows them, placed by
 * `rect`.
 */
export function appearanceTurnOf(annotation: {
  subtype: string;
  rect: PageBox;
  box?: PageBox | null;
  rotation?: number | null;
  intent?: string | null;
}): number | null {
  return pdfAppearanceTurnOf({
    ...annotation,
    rect: mirroredRect(annotation.rect),
    box: annotation.box ? mirroredRect(annotation.box) : annotation.box,
  });
}

/** Page space with its origin as the file's: turning one into the other is the mirror. */
const MIRROR: PdfRect = { left: 0, bottom: 0, right: 0, top: 0 };

/** Shape fields hold no destinations, so nothing asks for another page's box. */
const noOtherPage: VisibleBoxOf = () => {
  throw new Error('a shape field holds no destination');
};

/**
 * The shape fields that put `annotation` at `rect`, the rule an update's
 * `rect` follows (`create({ ...copy, ...shapeForRect(copy, target) })` puts a
 * copy there).
 *
 * - A kind whose shape is its rect (note, file attachment, link, popup,
 *   widget, redaction) takes `rect` as it is.
 * - A drawn kind has every place it holds mapped from its current `rect` onto
 *   `rect`, each axis on its own, as Acrobat does when a script sets
 *   `annot.rect`: a rect of the same size moves the shape, a bigger one
 *   stretches it. The engine then works out the rect from the shape, so it
 *   can differ a little from `rect` (a stroke keeps its width).
 *
 * A drawn kind refuses a rect that would squash it to no width or height, and
 * a rect of another size when it's turned (it can only move) or when its own
 * rect has no width or height to stretch. Each refusal is `InvalidArg` on
 * `rect`.
 */
export function shapeForRect<A extends AnnotationDTO>(annotation: A, rect: PageBox): Partial<A> {
  if (!DRAWN_RECT_KINDS.has(annotation.subtype)) return { rect } as Partial<A>;
  const read = annotation as unknown as Record<string, unknown>;
  const shape = Object.fromEntries(
    ['subtype', 'rect', ...shapeFieldsOf(annotation.subtype)]
      .filter((name) => read[name] !== undefined)
      .map((name) => [name, read[name]]),
  );
  const mirrored = pdfAnnotationOf(shape as AnnotationDTO, MIRROR, noOtherPage);
  const placed = pdfShapeForRect(mirrored, mirroredRect(rect));
  // The kind picks what each field holds; the answer is only the shape.
  const { subtype: _kind, ...fields } = pageAnnotationPatchOf(
    { subtype: annotation.subtype, ...placed } as never,
    MIRROR,
    noOtherPage,
  );
  return fields as unknown as Partial<A>;
}

/**
 * `patch` with its `rect` resolved as the engine resolves it on update (the
 * same step, `pdfResolveRectCommand`):
 *
 * - the rect the annotation reads, sent back, is dropped: nothing moves;
 * - on a drawn kind, another rect becomes the shape fields that put the
 *   drawing there (`shapeForRect`);
 * - a new rect with a changed shape field is refused (`InvalidArg` on
 *   `rect`): which of the two to follow would be a guess.
 *
 * A kind whose shape is its rect keeps it as a plain field. A viewer runs
 * this before it merges fields it writes itself, so a `rect` behaves the same
 * from every door. Values `patch` gives come back as given.
 */
export function resolveRectCommand(
  annotation: AnnotationDTO,
  patch: AnnotationPatch,
): AnnotationPatch {
  const given = patch as Record<string, unknown>;
  if (given.rect === undefined || !DRAWN_RECT_KINDS.has(annotation.subtype)) return patch;
  const read = annotation as unknown as Record<string, unknown>;
  const shapeNames = shapeFieldsOf(annotation.subtype);
  const pick = (from: Record<string, unknown>, names: readonly string[]) =>
    Object.fromEntries(
      names.filter((name) => from[name] !== undefined).map((name) => [name, from[name]]),
    );
  const current = pdfAnnotationOf(
    { subtype: annotation.subtype, ...pick(read, ['rect', ...shapeNames]) } as AnnotationDTO,
    MIRROR,
    noOtherPage,
  );
  const command = pdfAnnotationPatchOf(
    { subtype: annotation.subtype, ...pick(given, ['rect', ...shapeNames]) } as AnnotationPatch,
    MIRROR,
    noOtherPage,
  );
  const { subtype: _kind, ...placed } = pageAnnotationPatchOf(
    pdfResolveRectCommand(current, command),
    MIRROR,
    noOtherPage,
  ) as Record<string, unknown>;
  const { rect: _rect, ...rest } = given;
  const out: Record<string, unknown> = { ...rest };
  for (const [name, value] of Object.entries(placed)) {
    // The round trip through the file's edges can move a last digit: a value
    // the caller gave, that the command didn't change, is the caller's own.
    out[name] =
      given[name] !== undefined && semanticEqual(value, given[name]) ? given[name] : value;
  }
  return out as AnnotationPatch;
}

/**
 * Every page's box is the mirror, so a link's destination makes the round
 * trip into the file's coordinates and back unchanged, with no real page.
 */
const mirrorEveryPage: VisibleBoxOf = () => MIRROR;

/**
 * The patch the engine writes for `patch` on `current`: its subtype filled
 * in, checked against its kind, and every field that follows from it stated.
 * A drawn kind's new `rect` becomes the shape fields that put it there, a
 * note's standard review state brings its state model, a free text's
 * contents and rich text follow each other, a callout's line stays attached
 * to its moved box, and a measurement's label follows its points and scale.
 * Values `patch` gives come back as given.
 *
 * Throws `InvalidArg` for a patch the engine would refuse.
 */
export function resolveAnnotationPatch(
  current: AnnotationDTO,
  patch: AnnotationPatch,
  options: ResolveOptions = {},
): AnnotationPatch {
  const resolved = pdfResolveAnnotationPatch(
    pdfAnnotationOf(current, MIRROR, mirrorEveryPage),
    pdfAnnotationPatchOf(
      { ...patch, subtype: patch.subtype ?? current.subtype } as AnnotationPatch,
      MIRROR,
      mirrorEveryPage,
    ),
    options,
  );
  const back = pageAnnotationPatchOf(resolved, MIRROR, mirrorEveryPage) as Record<string, unknown>;
  // The round trip through the file's edges can move a box's last digit: a
  // value the caller gave, that no rule changed, is the caller's own.
  const given = patch as Record<string, unknown>;
  for (const name of Object.keys(back)) {
    if (given[name] !== undefined && semanticEqual(back[name], given[name]))
      back[name] = given[name];
  }
  return back as AnnotationPatch;
}

/**
 * `current` as the engine will read it after `patch`: what a viewer shows
 * while the write is on its way. Fields the engine works out or stamps itself
 * (a drawn kind's `rect`, the modified date and author) keep their current
 * value until the engine's answer brings the new one. A field `patch` leaves
 * alone keeps its very value.
 */
export function applyAnnotationPatch<A extends AnnotationDTO>(
  current: A,
  patch: AnnotationPatch,
  options: ResolveOptions = {},
): A {
  return applyResolvedPatch(current, resolveAnnotationPatch(current, patch, options));
}

/**
 * The draft the engine writes for `draft`: checked against its kind, and
 * every field that follows from it stated. A note's standard review state
 * brings its state model, a free text's rich text and contents follow each
 * other, and a measurement's label follows its points and scale. Fields left
 * out stay out: the kind's defaults (`ANNOTATION_DEFAULTS`) say what they
 * read back. Values `draft` gives come back as given.
 *
 * Throws `InvalidArg` for a draft the engine would refuse.
 */
export function resolveAnnotationDraft(
  draft: AnnotationDraft,
  options: DraftResolveOptions = {},
): AnnotationDraft {
  const resolved = pdfResolveAnnotationDraft(
    pdfAnnotationDraftOf(draft, MIRROR, mirrorEveryPage),
    options,
  );
  const back = pageAnnotationDraftOf(resolved, MIRROR, mirrorEveryPage) as Record<string, unknown>;
  const given = draft as Record<string, unknown>;
  for (const name of Object.keys(back)) {
    if (given[name] !== undefined && semanticEqual(back[name], given[name]))
      back[name] = given[name];
  }
  return back as AnnotationDraft;
}

/**
 * The annotation the engine will read back after creating `draft`: what a
 * viewer shows while the create is on its way. `context` says what the draft
 * doesn't: the ref and place it will have, who creates it, and, for a kind
 * whose `rect` the engine works out from its drawing, that box.
 */
export function annotationOfDraft(
  draft: AnnotationDraft,
  context: DraftContext<PageBox>,
): AnnotationDTO {
  return annotationOfResolvedDraft(
    resolveAnnotationDraft(draft, { describeFont: context.describeFont }),
    context,
  );
}
