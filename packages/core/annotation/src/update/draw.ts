/**
 * Drawing new annotations with the pointer: shapes, lines, ink and polygons.
 * A finished drawing becomes a new record (`new:<n>`) and a `create` effect.
 * Callouts and distance measurements have their own gestures (draw-callout.ts,
 * draw-distance.ts).
 */
import type { AnnotationFlags, InkIntent } from '@embedpdf/engine-core/runtime';

import { DRAWN_FLAGS } from '../flags';
import {
  rectFromPoints,
  shapeRectFor,
  transposedAboutCenter,
  unionRect,
  uprightRotation,
} from '../geometry';
import { straightenInkStroke } from '../ink';
import { type MeasurementAppearance } from '../measurement';
import { shapeMeasurementReadout } from '../measurement-shape';
import { clickCreateGeom, resolveClickPlacement } from '../placement';
import { styleFromProps, textStyleFromProps } from '../props';
import type {
  ClickCreate,
  ContentGeometry,
  Draft,
  Effect,
  InkStraightenOptions,
  Model,
  ModelAnnotation,
  PointerInput,
  Rect,
  Subtype,
} from '../types';
import { isPolySubtype, newRecordId } from './changes';
import { calloutPointer } from './draw-callout';
import { distancePointer } from './draw-distance';
import { clampPointToBox } from './page-bound';
import { defaultsFor } from './session';

/** The click ↔ drag threshold (content units): a press-release whose width and
 *  height both stay under it is a click. Exported so every gesture owner (the
 *  draw handler, the form plugin's place handler) shares one definition. */
export const MIN_DRAG = 3;

export function createPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  subtype: Subtype,
  input: PointerInput,
  preset: string = subtype,
  intent?: InkIntent,
  deferInkCommit = false,
  straightenInk?: InkStraightenOptions,
  clickCreate?: ClickCreate | false,
  flags?: Partial<AnnotationFlags>,
  measure?: MeasurementAppearance,
  capture?: string,
): [Model, Effect[]] {
  // An in-progress creation is anchored to its page: a move/up sample from
  // another page is a foreign frame — ignore it. (A down on another page is a
  // fresh intent: the per-subtype branches below start/restart the draft there.)
  if (
    phase !== 'down' &&
    model.draft &&
    'page' in model.draft &&
    model.draft.page.pageObjectNumber !== input.page.pageObjectNumber
  )
    return [model, []];
  // Shapes can't be drawn past the page edge — the pointer pins to it.
  if (input.pageBox) input = { ...input, point: clampPointToBox(input.point, input.pageBox) };
  if (
    model.draft?.kind === 'create-distance' ||
    (measure?.intent === 'line-dimension' && !capture)
  ) {
    return distancePointer(
      model,
      phase,
      input,
      preset,
      measure?.intent === 'line-dimension' ? measure : undefined,
      flags,
    );
  }
  if (subtype === 'free-text-callout') return calloutPointer(model, phase, input, preset, flags);
  if (phase === 'down') {
    if (isPolySubtype(subtype)) {
      if (input.finish) return finishPolyCreate(model);
      if (
        model.draft?.kind === 'create-poly' &&
        model.draft.subtype === subtype &&
        model.draft.preset === preset &&
        model.draft.page.pageObjectNumber === input.page.pageObjectNumber
      ) {
        return [
          {
            ...model,
            draft: {
              ...model.draft,
              points: [...model.draft.points, input.point],
              current: input.point,
            },
          },
          [],
        ];
      }
      return [
        {
          ...model,
          selected: [],
          draft: {
            kind: 'create-poly',
            subtype,
            preset,
            page: input.page,
            points: [input.point],
            current: input.point,
            closed: subtype === 'polygon',
            ...(measure && measure.intent !== 'line-dimension' ? { measure } : {}),
            ...(flags ? { flags } : {}),
          },
        },
        [],
      ];
    }
    const draft: Draft | null =
      subtype === 'line'
        ? {
            kind: 'create-line',
            measure,
            capture,
            subtype,
            preset,
            page: input.page,
            from: input.point,
            to: input.point,
            ...(clickCreate !== undefined ? { clickCreate } : {}),
            ...(flags ? { flags } : {}),
          }
        : subtype === 'ink'
          ? model.draft?.kind === 'create-ink' &&
            model.draft.subtype === subtype &&
            model.draft.preset === preset &&
            model.draft.page.pageObjectNumber === input.page.pageObjectNumber
            ? { ...model.draft, strokes: [...model.draft.strokes, [input.point]] }
            : {
                kind: 'create-ink',
                subtype,
                preset,
                page: input.page,
                strokes: [[input.point]],
                intent,
                ...(flags ? { flags } : {}),
              }
          : subtype === 'square' ||
              subtype === 'circle' ||
              subtype === 'free-text' ||
              subtype === 'redact' ||
              subtype === 'link'
            ? {
                kind: 'create-rect',
                subtype,
                preset,
                page: input.page,
                from: input.point,
                to: input.point,
                ellipse: subtype === 'circle',
                // Captured at down (the gesture's home page); a rotation of 0
                // makes upright a no-op, so the draft stays clean then.
                ...(input.upright && input.displayRotation
                  ? { displayRotation: input.displayRotation, upright: true }
                  : {}),
                ...(clickCreate !== undefined ? { clickCreate } : {}),
                ...(flags ? { flags } : {}),
              }
            : null;
    return draft ? [{ ...model, selected: [], draft }, []] : [model, []];
  }
  if (phase === 'move') {
    if (model.draft?.kind === 'create-poly') {
      return [{ ...model, draft: { ...model.draft, current: input.point } }, []];
    }
    if (model.draft?.kind === 'create-rect' || model.draft?.kind === 'create-line') {
      return [{ ...model, draft: { ...model.draft, to: input.point } }, []];
    }
    if (model.draft?.kind === 'create-ink') {
      // append to the active (last) stroke as the pen moves
      const strokes = model.draft.strokes.slice();
      strokes[strokes.length - 1] = [...strokes[strokes.length - 1], input.point];
      return [{ ...model, draft: { ...model.draft, strokes } }, []];
    }
    return [model, []];
  }
  // up
  const activeDraft = model.draft;
  if (
    activeDraft?.kind !== 'create-rect' &&
    activeDraft?.kind !== 'create-line' &&
    activeDraft?.kind !== 'create-ink'
  )
    return [model, []];

  if (activeDraft.kind === 'create-ink') {
    let next = model;
    if (straightenInk && activeDraft.strokes.length) {
      const strokes = activeDraft.strokes.slice();
      const last = strokes.length - 1;
      strokes[last] = straightenInkStroke(strokes[last], straightenInk);
      next = { ...model, draft: { ...activeDraft, strokes } };
    }
    return deferInkCommit ? [next, []] : finishInkCreate(next);
  }

  const definition = defaultsFor(model, activeDraft.preset ?? activeDraft.subtype);
  const style = styleFromProps(definition);
  let geometry: ContentGeometry | null = null;
  // The upright counter-rotation for a box commit (0 when the tool/page don't
  // ask for one). A dragged box keeps the on-screen footprint the author drew:
  // for a quarter-turn the unrotated box is the drag rect transposed about its
  // centre, so spinning it by `rot` lands exactly back on the dragged region.
  const upRot =
    activeDraft.kind === 'create-rect' && activeDraft.upright && activeDraft.displayRotation
      ? uprightRotation(activeDraft.displayRotation)
      : 0;
  const uprightBox = (dragged: Rect): Rect =>
    upRot === 90 || upRot === 270 ? transposedAboutCenter(dragged) : dragged;
  // Click commits resolve through the shared placement layer (placement.ts) —
  // the same `resolveClickPlacement` the footprint ghost and the form plugin
  // consume, so preview ≡ commit by construction. The core only supplies the
  // kind-level fallback for free text (a click must always yield a typable
  // box) and converts the placement to a ContentGeometry via `clickCreateGeom`.
  const clickGeom = (policy: ClickCreate): ContentGeometry | null =>
    clickCreateGeom(
      activeDraft.subtype,
      resolveClickPlacement(activeDraft.from, policy, {
        pageBox: input.pageBox,
        upright: activeDraft.kind === 'create-rect' ? activeDraft.upright : undefined,
        displayRotation:
          activeDraft.kind === 'create-rect' ? activeDraft.displayRotation : undefined,
      }),
      definition,
    );
  if (activeDraft.kind === 'create-rect' && activeDraft.subtype === 'free-text') {
    // Free-text: a dragged box, or — on a mere click — a default box you can
    // immediately type into (created unless the tool says `clickCreate: false`;
    // an empty text box is unreachable by drag alone, hence the kind-level
    // fallback: 180×40, top-left anchored so the box hangs where you'll type).
    const dragged = rectFromPoints(activeDraft.from, activeDraft.to);
    const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
    if (!isClick) {
      geometry = { kind: 'text', rect: uprightBox(dragged), ...(upRot ? { rot: upRot } : {}) };
    } else if (activeDraft.clickCreate !== false) {
      geometry = clickGeom(
        activeDraft.clickCreate && 'width' in activeDraft.clickCreate
          ? activeDraft.clickCreate
          : { width: 180, height: 40, anchor: 'top-left' },
      );
    }
  } else if (activeDraft.kind === 'create-rect') {
    const dragged = rectFromPoints(activeDraft.from, activeDraft.to);
    if (dragged.width >= MIN_DRAG || dragged.height >= MIN_DRAG) {
      // cloudy stores the outer box (dragged + extent) so the dragged box is its inner edge
      geometry = {
        kind: 'rect',
        rect: shapeRectFor(uprightBox(dragged), activeDraft.ellipse, style),
        ellipse: activeDraft.ellipse,
        ...(upRot ? { rot: upRot } : {}),
      };
    } else if (activeDraft.clickCreate && 'width' in activeDraft.clickCreate) {
      geometry = clickGeom(activeDraft.clickCreate);
    }
  } else if (activeDraft.kind === 'create-line') {
    if (
      Math.hypot(activeDraft.to.x - activeDraft.from.x, activeDraft.to.y - activeDraft.from.y) >=
      MIN_DRAG
    ) {
      geometry = {
        kind: 'line',
        a: activeDraft.from,
        b: activeDraft.to,
        ends: definition.lineEndings,
      };
    } else if (activeDraft.clickCreate && 'length' in activeDraft.clickCreate) {
      geometry = clickGeom(activeDraft.clickCreate);
    }
  }
  if (!geometry) return [{ ...model, draft: null }, []];
  if (activeDraft.kind === 'create-line' && activeDraft.capture)
    return [
      { ...model, draft: null },
      [{ type: 'captured', tool: activeDraft.capture, page: activeDraft.page, geometry }],
    ];

  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: activeDraft.page,
    subtype: activeDraft.subtype,
    ...(activeDraft.kind === 'create-line' && activeDraft.measure
      ? { measure: activeDraft.measure }
      : {}),
    geometry,
    style,
    // A text kind carries its text styling from birth, so the tool's font
    // defaults actually apply to what you draw.
    ...(geometry.kind === 'text' ? { text: textStyleFromProps(definition) } : {}),
    // A drawn link starts at the tool preset's target ('docs-link' style
    // presets), or dead (`null` — the create-then-edit flow).
    ...(activeDraft.subtype === 'link' ? { link: definition.link ?? null } : {}),
    flags: { ...DRAWN_FLAGS, ...activeDraft.flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      // A freshly drawn free-text box opens straight into edit (type immediately).
      editing: geometry.kind === 'text' ? id : model.editing,
    },
    [{ type: 'create', id }],
  ];
}

/** Commit all strokes accumulated by a grouped ink gesture. */
export function finishInkCreate(model: Model): [Model, Effect[]] {
  const draft = model.draft;
  if (draft?.kind !== 'create-ink') return [model, []];
  const points = draft.strokes.flat();
  if (!draft.strokes.some((stroke) => stroke.length >= 2) || points.length === 0)
    return [{ ...model, draft: null }, []];
  const bounds = unionRect(points);
  if (Math.max(bounds.width, bounds.height) < MIN_DRAG) return [{ ...model, draft: null }, []];

  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: draft.subtype,
    geometry: { kind: 'ink', strokes: draft.strokes },
    style: styleFromProps(defaultsFor(model, draft.preset ?? draft.subtype)),
    ...(draft.intent ? { intent: draft.intent } : {}),
    flags: { ...DRAWN_FLAGS, ...draft.flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
    },
    [{ type: 'create', id }],
  ];
}

export function finishPolyCreate(model: Model): [Model, Effect[]] {
  const draft = model.draft;
  if (draft?.kind !== 'create-poly') return [model, []];
  const minPoints = draft.closed ? 3 : 2;
  if (draft.points.length < minPoints) return [{ ...model, draft: null }, []];

  const definition = defaultsFor(model, draft.preset ?? draft.subtype);
  const geometry: ContentGeometry = {
    kind: 'poly',
    points: draft.points,
    closed: draft.closed,
    ends: draft.closed ? undefined : definition.lineEndings,
  };
  if (draft.measure && 'unavailable' in shapeMeasurementReadout(geometry, draft.measure))
    return [model, []];

  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: draft.subtype,
    geometry,
    measure: draft.measure,
    style: styleFromProps(definition),
    flags: { ...DRAWN_FLAGS, ...draft.flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
    },
    [{ type: 'create', id }],
  ];
}
