/** Drawing a distance measurement: the measured line, then the offset of its dimension line. */
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';

import {
  distanceLeaderLength,
  measurementDraftFields,
  type DistanceAppearance,
} from '../measurement';
import { styleOf } from '../record';
import type { Shape, Effect, Model, PointerInput } from '../types';
import { draftOf, newRecord } from './changes';
import { MIN_DRAG } from '../placement';
import { defaultsFor, lineEndingsOf, toolAnnotation } from './session';

/**
 * Distance creation has two stages. Releasing the endpoint drag only advances
 * to offset placement; the following click is the sole persistence boundary.
 */
export function distancePointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
  preset: string,
  measure?: DistanceAppearance,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const draft = model.draft;

  if (draft?.kind !== 'create-distance') {
    if (phase !== 'down' || !measure) {
      return [model, []];
    }

    return [
      {
        ...model,
        selected: [],
        draft: {
          kind: 'create-distance',
          step: 'endpoints',
          subtype: 'line',
          preset,
          page: input.page,
          from: input.point,
          to: input.point,
          measure: {
            ...measure,
            leader: { ...measure.leader, length: 0 },
          },
          ...(flags ? { flags } : {}),
        },
      },
      [],
    ];
  }

  // Even the final placement click belongs to the draft's original page.
  if (input.page.objectNumber !== draft.page.objectNumber) {
    return [model, []];
  }

  if (draft.step === 'endpoints') {
    if (phase === 'down') {
      return [model, []];
    }

    const nextDraft = { ...draft, to: input.point };
    if (phase === 'move') {
      return [{ ...model, draft: nextDraft }, []];
    }

    const length = Math.hypot(nextDraft.to.x - nextDraft.from.x, nextDraft.to.y - nextDraft.from.y);
    if (length < MIN_DRAG) {
      return [{ ...model, draft: null }, []];
    }

    return [{ ...model, draft: { ...nextDraft, step: 'offset' } }, []];
  }

  if (phase === 'up') {
    return [model, []];
  }

  const tool = toolAnnotation(model, draft.subtype, draft.preset);
  const geometry: Shape = {
    kind: 'line',
    linePoints: { start: draft.from, end: draft.to },
    lineEndings: lineEndingsOf(tool),
    rotation: 0,
  };
  const appearance: DistanceAppearance = {
    ...draft.measure,
    leader: {
      ...draft.measure.leader,
      length: distanceLeaderLength(geometry, input.point),
    },
  };

  if (phase === 'move') {
    return [{ ...model, draft: { ...draft, measure: appearance } }, []];
  }

  const style = styleOf(tool);
  const created = newRecord(
    model,
    draft.page,
    draftOf(
      'line',
      defaultsFor(model, draft.preset),
      geometry,
      {
        ...measurementDraftFields(appearance),
        // The arrowheads fill with the stroke colour when the tool gives no fill.
        interiorColor: style.interiorColor ?? style.color,
      },
      draft.flags,
    ),
  );
  const id = created.record.id;

  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}
