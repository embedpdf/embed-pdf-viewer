/**
 * Creation from the API: page-space geometry in, the same new record and
 * `create` effect a draw tool commits out.
 */
import { DRAWN_FLAGS } from '../flags';
import { applyProps, styleFromProps, textStyleFromProps } from '../props';
import { annotationAfter } from '../record';
import type { ModelGeometry, Effect, Message, Model, Subtype } from '../types';
import { newRecord } from './changes';
import { defaultsFor } from './session';

/**
 * The data API's create: page-space geometry in, the same optimistic
 * annotation and `create` effect a draw tool commits out. Defaults come from
 * the preset (a tool id or the bare subtype); `props` override them; line and
 * open-poly kinds take the preset's line endings when the geometry carries none.
 */
export function createAnnot(
  model: Model,
  message: Extract<Message, { type: 'createAnnot' }>,
): [Model, Effect[]] {
  const preset = (message.preset ?? message.subtype) as Subtype;
  const definition = defaultsFor(model, preset);
  const geometry: ModelGeometry =
    (message.geometry.kind === 'line' ||
      (message.geometry.kind === 'poly' && !message.geometry.closed)) &&
    !message.geometry.ends
      ? { ...message.geometry, ends: definition.lineEndings }
      : message.geometry;
  const base = newRecord(model, {
    page: message.page,
    subtype: message.subtype,
    geometry,
    style: styleFromProps(definition),
    ...(geometry.kind === 'text' ? { text: textStyleFromProps(definition) } : {}),
    ...(message.subtype === 'link' ? { link: definition.link ?? null } : {}),
    flags: { ...DRAWN_FLAGS, ...message.flags },
  });
  const id = base.id;
  // The props land on the new record's fields; its annotation follows them.
  const styled = message.props ? applyProps(base, message.props) : null;
  const annotation = styled ? { ...styled, annotation: annotationAfter(base, styled) } : base;
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      ...(message.select ? { selected: [id] } : {}),
    },
    [{ type: 'create', id }],
  ];
}
