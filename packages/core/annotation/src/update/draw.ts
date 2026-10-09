/**
 * Drawing new annotations with the pointer: shapes, lines, ink and polygons.
 * A finished drawing becomes a new record (keyed by the `nm` ref it is
 * written under) and a `create` effect.
 * Callouts and distance measurements have their own gestures (draw-callout.ts,
 * draw-distance.ts).
 */
import type { AnnotationFlags, InkIntent } from '@embedpdf/engine-core/runtime';

import { straightenInkStroke } from '../ink';
import { measurementDraftFields, type MeasurementAppearance } from '../measurement';
import { shapeMeasurementReadout } from '../measurement-shape';
import { gesturePlacement, MIN_DRAG, placedShape } from '../placement';
import { writableTarget } from '../record';
import { unionRect } from '../rect';
import type {
  ClickCreate,
  Shape,
  Draft,
  Effect,
  FieldValues,
  InkStraightenOptions,
  Model,
  Placement,
  PointerInput,
  Rect,
  KindName,
} from '../types';
import { draftOf, isPolySubtype, newRecord, numbersLeft } from './changes';
import { calloutPointer } from './draw-callout';
import { distancePointer } from './draw-distance';
import { clampPointToBox } from './page-bound';
import { defaultsFor, lineEndingsOf, toolAnnotation } from './session';

/** A box or a line being drawn: the gestures a click or a drag completes. */
type ShapeDraft = Extract<Draft, { kind: 'create-rect' | 'create-line' }>;

/**
 * Where a box or a line being drawn puts what it makes if released now: the
 * dragged box or segment, or the tool's click default (`gesturePlacement`).
 * The commit below and the drawing in progress (view.ts) both read it, and
 * the tool's ghost makes the same call at the pointer.
 */
export function draftPlacement(draft: ShapeDraft, pageBox?: Rect): Placement | null {
  return gesturePlacement(
    draft.kind === 'create-line' ? 'segment' : 'box',
    draft.from,
    draft.to,
    draft.clickCreate,
    { pageBox, upright: draft.upright, displayRotation: draft.displayRotation },
  );
}

export function createPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  subtype: KindName,
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
    model.draft.page.objectNumber !== input.page.objectNumber
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
        model.draft.page.objectNumber === input.page.objectNumber
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
            // Captured at down, as for a box: an upright click lays the line as seen.
            ...(input.upright && input.displayRotation
              ? { displayRotation: input.displayRotation, upright: true }
              : {}),
            ...(clickCreate !== undefined ? { clickCreate } : {}),
            ...(flags ? { flags } : {}),
          }
        : subtype === 'ink'
          ? model.draft?.kind === 'create-ink' &&
            model.draft.subtype === subtype &&
            model.draft.preset === preset &&
            model.draft.page.objectNumber === input.page.objectNumber
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

  // What the gesture makes: the dragged shape, or the tool's click default,
  // laid by the kind's shape family. The tool's ghost showed exactly this.
  const tool = toolAnnotation(model, activeDraft.subtype, activeDraft.preset);
  const placement = draftPlacement(activeDraft, input.pageBox);
  const geometry: Shape | null = placement && placedShape(tool, placement);
  if (!geometry) return [{ ...model, draft: null }, []];
  if (activeDraft.kind === 'create-line' && activeDraft.capture)
    return [
      { ...model, draft: null },
      [{ type: 'captured', tool: activeDraft.capture, page: activeDraft.page, geometry }],
    ];

  const fields: FieldValues = {
    // A measurement states its intent, scale, caption and leader.
    ...(activeDraft.kind === 'create-line' && activeDraft.measure
      ? measurementDraftFields(activeDraft.measure)
      : {}),
    // A free text starts empty, as a plain box.
    ...(geometry.kind === 'text-box' ? { intent: 'free-text', contents: '' } : {}),
    // A drawn link starts at the tool preset's target ('docs-link' style
    // presets), or dead (`null` — the create-then-edit flow).
    ...(activeDraft.subtype === 'link'
      ? { target: writableTarget(tool.subtype === 'link' ? tool.target : null) }
      : {}),
  };
  const created = newRecord(
    model,
    activeDraft.page,
    draftOf(
      activeDraft.subtype,
      defaultsFor(model, activeDraft.preset ?? activeDraft.subtype),
      geometry,
      fields,
      activeDraft.flags,
    ),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      // A freshly drawn free-text box opens straight into edit (type immediately).
      editing: geometry.kind === 'text-box' ? id : model.editing,
    },
    [{ type: 'create', id, draft: created.draft }],
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

  const created = newRecord(
    model,
    draft.page,
    draftOf(
      draft.subtype,
      defaultsFor(model, draft.preset ?? draft.subtype),
      { kind: 'ink', inkList: draft.strokes, rotation: 0 },
      // The ink highlighter says so: `/IT` is set at create, never changed.
      draft.intent === 'ink-highlight' ? { intent: draft.intent } : {},
      draft.flags,
    ),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}

export function finishPolyCreate(model: Model): [Model, Effect[]] {
  const draft = model.draft;
  if (draft?.kind !== 'create-poly') return [model, []];
  const minPoints = draft.closed ? 3 : 2;
  if (draft.points.length < minPoints) return [{ ...model, draft: null }, []];

  const tool = toolAnnotation(model, draft.subtype, draft.preset);
  const geometry: Shape = {
    kind: 'poly',
    vertices: draft.points,
    closed: draft.closed,
    lineEndings: draft.closed ? undefined : lineEndingsOf(tool),
    rotation: 0,
  };
  if (draft.measure && 'unavailable' in shapeMeasurementReadout(geometry, draft.measure))
    return [model, []];

  const created = newRecord(
    model,
    draft.page,
    draftOf(
      draft.subtype,
      defaultsFor(model, draft.preset ?? draft.subtype),
      geometry,
      draft.measure ? measurementDraftFields(draft.measure) : {},
      draft.flags,
    ),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}
