/** Drawing a distance measurement: the measured line, then the offset of its dimension line. */
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';

import { DRAWN_FLAGS } from '../flags';
import { distanceLeaderLength, type DistanceAppearance } from '../measurement';
import { styleFromProps } from '../props';
import type { ContentGeometry, Effect, Model, ModelAnnotation, PointerInput } from '../types';
import { newRecordId } from './changes';
import { MIN_DRAG } from './draw';
import { defaultsFor } from './session';

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
  if (input.page.pageObjectNumber !== draft.page.pageObjectNumber) {
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

  const defaults = defaultsFor(model, draft.preset);
  const geometry: ContentGeometry = {
    kind: 'line',
    a: draft.from,
    b: draft.to,
    ends: defaults.lineEndings,
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

  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: 'line',
    geometry,
    measure: appearance,
    style: {
      ...styleFromProps(defaults),
      interiorColor: defaults.interiorColor ?? defaults.color,
    },
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
