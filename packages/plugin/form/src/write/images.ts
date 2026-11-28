/**
 * An image field's picture: `setButtonImage()` puts one in, or takes it out. It is filling in,
 * gated by the right to fill the field in, as `setValue()` is, and it goes through the form's
 * change path the way a value does: one change, one step to undo, the field's events, and the
 * plugin's own prediction of `hasImage` (the engine predicts none), so the box says it holds a
 * picture at once and shows it once the engine has drawn it.
 */
import { PluginError, toPluginError, type ChangeLabel } from '@embedpdf/core';
import { resolveBinarySource, type ChangeOp } from '@embedpdf/engine-core/runtime';

import type { FormCapability } from '../contract';
import { fieldByRef } from '../model';
import type { FormContext, FormServices } from '../services';
import { undoLookOf } from '../sync/predict';

export function createImageWrites(
  ctx: FormContext,
  { fields, rights }: Pick<FormServices, 'fields' | 'rights'>,
) {
  const setButtonImage: FormCapability['setButtonImage'] = async (ref, image, options) => {
    if (!fields.view().snapshot) await fields.settled();
    const field = fieldByRef(fields.view(), ref);
    if (!field) throw new PluginError('not-found', 'form', 'no form field has this ref');
    if (field.kind !== 'pushbutton') {
      throw new PluginError('invalid-input', 'form', `'${field.name}' is no push button`);
    }
    rights.assertMayFill(field, 'form.setButtonImage');
    // The bytes are the call's: a copy the change owns, whatever the app passed.
    const bytes =
      image === null ? null : new Uint8Array((await resolveBinarySource(image.source)).bytes);
    const op: ChangeOp = { type: 'forms.setButtonImage', field: field.ref, image: bytes };
    const change = ctx.changes.stage({
      label: { key: 'form.setButtonImage' } satisfies ChangeLabel,
      ops: [op],
      undo: undoLookOf(fields.view(), [op]),
    });
    try {
      const { items } = await ctx.cancellable(options?.signal, change.result);
      const item = items[0];
      return { field: item?.type === 'forms.setButtonImage' ? item.field : field };
    } catch (error) {
      throw toPluginError('form', error);
    }
  };

  return { api: { setButtonImage } satisfies Partial<FormCapability> };
}
